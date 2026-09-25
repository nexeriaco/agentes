const { PDFParse } = require('pdf-parse');
const { compile } = require('html-to-text');
const { fetch: undiciFetch } = require('undici');
const { assertFetchableUrl, getSafeFetchDispatcher, UrlGuardError } = require('./urlGuard');

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const FETCH_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
// Texto completo guardado en page_cache (antes del rank). Más alto que el
// techo que ve Claude: así el Ecoparque al final de una home no se pierde.
const MAX_CACHE_TEXT_CHARS = 200000;
// Extracto máximo que se envía a Claude tras chunk + rank.
const MAX_RETURN_CHARS = 4000;
const TARGET_CHUNK_CHARS = 400;
// Tope de páginas de texto a indexar por PDF (el rank luego elige el
// bloque útil). Documentos más largos se recortan a las primeras N.
const MAX_PDF_PAGES = 50;
const MIN_PDF_TEXT_CHARS = 40;
// PDFs escaneados: cada página va como imagen a Claude (caro); límite bajo.
const MAX_SCREENSHOT_PAGES = 8;

const CACHE_V2_PREFIX = 'PAGE_CACHE_V2';

const convertHtml = compile({
  wordwrap: false,
  selectors: [
    { selector: 'a', options: { ignoreHref: false, linkBrackets: ['[', ']'] } },
    { selector: 'img', format: 'skip' },
    { selector: 'script', format: 'skip' },
    { selector: 'style', format: 'skip' },
    { selector: 'nav', format: 'skip' },
    { selector: 'footer', format: 'skip' },
  ],
});

function textResult(text, kind = 'link') {
  return { content: [{ type: 'text', text }], kind };
}

function clipForCache(text) {
  if (text.length <= MAX_CACHE_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_CACHE_TEXT_CHARS)}\n[...contenido recortado para caché...]`;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2);
}

// Sinónimos de búsqueda municipal: "precio" no aparece en muchas
// ordenanzas (dicen tarifa/cuota/€); sin ampliar, el rank se queda en
// el inicio del PDF donde solo hay definiciones.
const QUERY_SYNONYMS = {
  precio: ['tarifa', 'tarifas', 'cuota', 'importe', 'euros', 'euro', 'coste', 'costo', 'tasa'],
  precios: ['tarifa', 'tarifas', 'cuota', 'cuotas', 'importe', 'euros', 'coste', 'tasa'],
  cuesta: ['tarifa', 'cuota', 'importe', 'euros', 'coste', 'precio'],
  coste: ['tarifa', 'cuota', 'precio', 'importe', 'euros', 'tasa'],
  costo: ['tarifa', 'cuota', 'precio', 'importe', 'euros', 'tasa'],
  importe: ['tarifa', 'cuota', 'precio', 'euros', 'tasa'],
  tasa: ['tarifa', 'cuota', 'precio', 'importe', 'euros'],
  tarifas: ['tarifa', 'cuota', 'precio', 'importe', 'euros'],
  tarifa: ['cuota', 'precio', 'importe', 'euros', 'tasa'],
  horario: ['horarios', 'hora', 'apertura', 'cierre', 'abre', 'cierra'],
  horarios: ['horario', 'hora', 'apertura', 'cierre'],
  telefono: ['tel', 'movil', 'contacto', 'llamada'],
  email: ['correo', 'mail', 'e-mail', 'contacto'],
};

const PRICE_INTENT_RE = /\b(precio|precios|cuesta|coste|costo|importe|tarifa|tarifas|cuota|tasa|euros?)\b/i;

function expandQueryTokens(tokens) {
  const out = new Set(tokens);
  for (const t of tokens) {
    const syns = QUERY_SYNONYMS[t];
    if (syns) {
      for (const s of syns) out.add(s);
    }
  }
  return [...out];
}

function splitIntoChunks(text) {
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    const t = String(text).trim();
    return t ? [t] : [];
  }

  const chunks = [];
  let buf = '';

  for (const p of paragraphs) {
    if (!buf) {
      buf = p;
      continue;
    }
    if (buf.length + p.length + 2 <= TARGET_CHUNK_CHARS * 1.5) {
      buf = `${buf}\n\n${p}`;
      continue;
    }
    chunks.push(buf);
    if (p.length > TARGET_CHUNK_CHARS * 2) {
      for (let i = 0; i < p.length; i += TARGET_CHUNK_CHARS) {
        chunks.push(p.slice(i, i + TARGET_CHUNK_CHARS));
      }
      buf = '';
    } else {
      buf = p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function countEuroAmounts(chunk) {
  // Regex local (sin /g compartido): evita lastIndex sucio entre llamadas.
  const matches = String(chunk).match(/\d+[.,]\d{2}\s*€|\b\d+[.,]\d{2}\s*euros?\b|€\s*\d+/gi);
  return matches ? matches.length : 0;
}

function scoreChunk(chunk, queryTokens, { priceIntent = false } = {}) {
  const normalized = normalizeForMatch(chunk);
  let score = 0;
  for (const token of queryTokens) {
    if (normalized.includes(token)) score += 1;
  }
  // Ligero empujón a trozos con enlaces (trámites que necesitan el href).
  if (/https?:\/\//i.test(chunk)) score += 0.25;

  const euroCount = countEuroAmounts(chunk);
  if (priceIntent && euroCount > 0) {
    // Tabla de tarifas: varios importes en el mismo trozo → muy prometedor.
    score += Math.min(3, 0.75 + euroCount * 0.35);
  }
  if (priceIntent && /\btarifa\s*\d+\b/i.test(chunk)) score += 1.25;
  if (priceIntent && /cuota tributaria/i.test(chunk)) score += 1.5;

  return score;
}

// Título corto de FAQ (p. ej. «¿Cuál es el horario del Ecoparque?»): el
// párrafo de respuesta suele ir en el chunk siguiente y a menudo puntúa
// menos (no repite «horario»). Sin vecino, Claude solo ve el título.
function looksLikeFaqTitle(chunk) {
  const t = String(chunk || '').trim();
  if (!t || t.length > 220) return false;
  return /\?\s*$/.test(t) || /¿[^?]{3,180}\?/.test(t);
}

function clipExtract(text) {
  if (text.length <= MAX_RETURN_CHARS) return text;
  return `${text.slice(0, MAX_RETURN_CHARS)}\n[...contenido recortado...]`;
}

// Agrupa índices contiguos en clusters { start, end, scoreSum, peak }.
function buildClusters(seedIndexes, scoresByIndex) {
  const sorted = [...seedIndexes].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const clusters = [];
  let start = sorted[0];
  let end = sorted[0];
  let scoreSum = scoresByIndex[sorted[0]] || 0;
  let peak = scoreSum;

  for (let i = 1; i < sorted.length; i += 1) {
    const idx = sorted[i];
    if (idx === end + 1) {
      end = idx;
      const s = scoresByIndex[idx] || 0;
      scoreSum += s;
      if (s > peak) peak = s;
    } else {
      clusters.push({ start, end, scoreSum, peak });
      start = idx;
      end = idx;
      scoreSum = scoresByIndex[idx] || 0;
      peak = scoreSum;
    }
  }
  clusters.push({ start, end, scoreSum, peak });
  return clusters;
}

function clusterPromise(cluster) {
  // Preferir pico alto (tabla de tarifas) y, a igualdad, mayor masa útil.
  return cluster.peak * 1000 + cluster.scoreSum;
}

// Expande un cluster hacia vecinos útiles (continuación de tabla / FAQ /
// enlaces) sin pasar MAX_RETURN_CHARS.
function expandCluster(cluster, chunks, scoresByIndex, priceIntent) {
  let start = cluster.start;
  let end = cluster.end;
  let usedChars = 0;
  for (let i = start; i <= end; i += 1) usedChars += chunks[i].length + (i > start ? 2 : 0);

  const canAdd = (idx) => {
    if (idx < 0 || idx >= chunks.length) return false;
    const nextLen = chunks[idx].length + 2;
    return usedChars + nextLen <= MAX_RETURN_CHARS;
  };

  const isUsefulNeighbor = (idx) => {
    const s = scoresByIndex[idx] || 0;
    if (s > 0) return true;
    if (looksLikeFaqTitle(chunks[idx])) return true;
    if (/https?:\/\//i.test(chunks[idx])) return true;
    if (priceIntent && (countEuroAmounts(chunks[idx]) > 0 || /\btarifa\s*\d+\b/i.test(chunks[idx]))) {
      return true;
    }
    return false;
  };

  let grew = true;
  while (grew) {
    grew = false;
    if (canAdd(end + 1) && isUsefulNeighbor(end + 1)) {
      end += 1;
      usedChars += chunks[end].length + 2;
      grew = true;
    }
    if (canAdd(start - 1) && isUsefulNeighbor(start - 1)) {
      start -= 1;
      usedChars += chunks[start].length + 2;
      grew = true;
    }
  }

  // Si aún cabe presupuesto y el pico es una tabla (€), seguir un poco
  // hacia adelante aunque el score del vecino sea 0 (líneas de tarifa
  // partidas sin repetir "vado"/"precio").
  while (
    priceIntent
    && canAdd(end + 1)
    && countEuroAmounts(chunks[end]) > 0
    && (countEuroAmounts(chunks[end + 1]) > 0 || /\btarifa\s*\d+\b/i.test(chunks[end + 1]))
  ) {
    end += 1;
    usedChars += chunks[end].length + 2;
  }

  return { start, end };
}

// Recorre TODO el documento (chunk a chunk), puntúa cada trozo con la
// consulta ampliada por sinónimos, agrupa hits contiguos y se queda solo
// con el cluster más prometedor (ahorro de tokens). Si no hay señal útil,
// cae al inicio del documento.
function selectRelevantExtracts(fullText, query) {
  const text = String(fullText || '');
  if (!text) return '';

  const rawTokens = [...new Set(tokenize(query || ''))];
  if (rawTokens.length === 0) {
    return clipExtract(text);
  }

  const queryTokens = expandQueryTokens(rawTokens);
  const priceIntent = PRICE_INTENT_RE.test(String(query || ''));
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return '';

  // Puntuar el documento entero: no se corta la búsqueda a los primeros N.
  const scoresByIndex = chunks.map((chunk) => scoreChunk(chunk, queryTokens, { priceIntent }));
  let maxScore = 0;
  for (const s of scoresByIndex) {
    if (s > maxScore) maxScore = s;
  }

  // Intent de precio sin hits léxicos: segunda pasada solo por importes €.
  if (maxScore <= 0 && priceIntent) {
    for (let i = 0; i < chunks.length; i += 1) {
      const euros = countEuroAmounts(chunks[i]);
      if (euros > 0) scoresByIndex[i] = 0.5 + euros * 0.35;
      if (scoresByIndex[i] > maxScore) maxScore = scoresByIndex[i];
    }
  }

  if (maxScore <= 0) {
    return clipExtract(text);
  }

  // Semillas: lo más cercano al pico (no el inicio del PDF por empate débil).
  const seedThreshold = Math.max(maxScore * 0.55, maxScore - 1.5);
  const seedIndexes = [];
  for (let i = 0; i < scoresByIndex.length; i += 1) {
    if (scoresByIndex[i] >= seedThreshold && scoresByIndex[i] > 0) {
      seedIndexes.push(i);
    }
  }

  const clusters = buildClusters(seedIndexes, scoresByIndex);
  if (clusters.length === 0) {
    return clipExtract(text);
  }

  clusters.sort((a, b) => clusterPromise(b) - clusterPromise(a));
  const best = expandCluster(clusters[0], chunks, scoresByIndex, priceIntent);

  const parts = [];
  for (let i = best.start; i <= best.end; i += 1) parts.push(chunks[i]);
  return clipExtract(parts.join('\n\n---\n\n'));
}

function buildClaudeText(url, kind, fullText, query) {
  const extract = selectRelevantExtracts(fullText, query);
  const header =
    kind === 'pdf'
      ? `Extractos relevantes del PDF ${url}`
      : `Extractos relevantes de la página ${url}`;
  const queryNote = query && String(query).trim()
    ? ` para la consulta: ${String(query).trim()}`
    : '';
  return `${header}${queryNote}:\n\n${extract}`;
}

function packFullTextCache(url, kind, fullText) {
  return [
    {
      type: 'text',
      text: `${CACHE_V2_PREFIX}\nkind: ${kind}\nurl: ${url}\n\n${fullText}`,
    },
  ];
}

function unpackFullTextCache(content) {
  if (!Array.isArray(content) || content.length === 0) return null;
  if (content.some((block) => block.type === 'image')) {
    return { kind: 'pdf', content };
  }

  const text = (content.find((block) => block.type === 'text') || {}).text || '';
  if (!text.startsWith(CACHE_V2_PREFIX)) {
    // Caché antigua (ya truncada): se puede re-rankear sobre lo que haya.
    let kind = 'link';
    if (text.startsWith('Texto extraído del PDF') || text.startsWith('El PDF ')) kind = 'pdf';
    if (
      text.startsWith('No se pudo')
      || text.includes('no se puede procesar')
      || text.includes('No se pudo acceder')
    ) {
      return { kind: 'error', content };
    }
    const bodyMatch = text.match(/\n\n([\s\S]*)$/);
    return { kind, fullText: bodyMatch ? bodyMatch[1] : text, legacy: true };
  }

  const match = text.match(/^PAGE_CACHE_V2\nkind: (\w+)\nurl: (.+)\n\n([\s\S]*)$/);
  if (!match) return { kind: 'link', fullText: text };
  return { kind: match[1], url: match[2], fullText: match[3] };
}

async function readResponseBody(response) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_BYTES) {
    return { error: `El documento supera el tamaño máximo permitido (${Math.round(MAX_BYTES / 1024 / 1024)}MB); no se puede procesar.` };
  }

  const contentType = response.headers.get('content-type') || '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return { error: `El documento supera el tamaño máximo permitido (${Math.round(MAX_BYTES / 1024 / 1024)}MB); no se puede procesar.` };
    }
    chunks.push(value);
  }

  return { buffer: Buffer.concat(chunks), contentType };
}

// Descarga con tope de tamaño/tiempo. Cada hop (URL inicial + redirects) se
// revalida con la política del turno (B′/B″) y contra destinos privados (C).
async function fetchWithLimit(url, policy) {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertFetchableUrl(currentUrl, policy);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await undiciFetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        dispatcher: getSafeFetchDispatcher(),
        headers: { Accept: 'text/html,application/pdf,*/*' },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { error: `Redirección sin destino (HTTP ${response.status}).` };
      }
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    if (!response.ok) {
      return { error: `No se pudo acceder a la URL (HTTP ${response.status}).` };
    }

    return readResponseBody(response);
  }

  return { error: `Demasiadas redirecciones (máximo ${MAX_REDIRECTS}).` };
}

function handleHtml(buffer) {
  const fullText = clipForCache(convertHtml(buffer.toString('utf8')));
  return { kind: 'link', fullText };
}

async function handlePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    const totalPages = info.total || 1;
    const pagesToRead = Math.min(totalPages, MAX_PDF_PAGES);
    const truncated = totalPages > MAX_PDF_PAGES;

    // first+last = rango inclusivo (páginas 1..pagesToRead).
    const { text } = await parser.getText({ first: 1, last: pagesToRead });
    const trimmed = (text || '').trim();

    if (trimmed.length >= MIN_PDF_TEXT_CHARS) {
      let fullText = clipForCache(trimmed);
      if (truncated) {
        fullText += `\n\n[Documento de ${totalPages} páginas: solo se han indexado las primeras ${MAX_PDF_PAGES}.]`;
      }
      return { kind: 'pdf', fullText };
    }

    // Escaneado: pocas páginas como imagen (coste de visión).
    const lastPage = Math.min(totalPages, MAX_SCREENSHOT_PAGES);
    const screenshot = await parser.getScreenshot({ first: 1, last: lastPage });

    const imageBlocks = screenshot.pages.map((page) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: Buffer.from(page.data).toString('base64'),
      },
    }));

    return {
      kind: 'pdf',
      content: [
        {
          type: 'text',
          text: `El PDF no tiene texto extraíble (parece un documento escaneado). Aquí tienes sus páginas (${imageBlocks.length} de ${totalPages}) como imágenes para que las leas visualmente:`,
        },
        ...imageBlocks,
      ],
    };
  } finally {
    await parser.destroy();
  }
}

// Descarga la URL y devuelve texto completo (para caché) o content listo
// (PDF escaneado / error). No aplica aún el filtro por pregunta.
// `policy` = resultado de buildReadableUrlPolicy (obligatorio para fetch).
async function fetchUrlRaw(url, policy) {
  let fetched;
  try {
    fetched = await fetchWithLimit(url, policy);
  } catch (err) {
    if (err instanceof UrlGuardError) {
      return textResult(`No se pudo acceder a la URL ${url}: ${err.message}`, 'error');
    }
    const reason = err.name === 'AbortError' ? 'se agotó el tiempo de espera' : err.message;
    return textResult(`No se pudo acceder a la URL ${url}: ${reason}.`, 'error');
  }

  if (fetched.error) {
    return textResult(fetched.error, 'error');
  }

  const isPdf =
    fetched.contentType.includes('application/pdf') || url.toLowerCase().split('?')[0].endsWith('.pdf');

  try {
    return isPdf ? await handlePdf(fetched.buffer) : handleHtml(fetched.buffer);
  } catch (err) {
    return textResult(`No se pudo procesar el contenido de ${url}: ${err.message}`, 'error');
  }
}

function toClaudeResult(url, raw, query) {
  if (raw.content && !raw.fullText) {
    // error o PDF escaneado: sin rank
    if (raw.kind === 'pdf' && Array.isArray(raw.content)) {
      const header = raw.content[0];
      if (header && header.type === 'text' && header.text.startsWith('El PDF no tiene')) {
        return {
          kind: raw.kind,
          content: [
            { type: 'text', text: header.text.replace('El PDF no tiene', `El PDF ${url} no tiene`) },
            ...raw.content.slice(1),
          ],
        };
      }
    }
    return { kind: raw.kind, content: raw.content };
  }

  return textResult(buildClaudeText(url, raw.kind || 'link', raw.fullText, query), raw.kind || 'link');
}

// Ejecutor usado por la caché: fetch crudo + empaquetado para page_cache.
async function buscarUrl(url, policy) {
  const raw = await fetchUrlRaw(url, policy);
  if (raw.fullText != null) {
    return {
      kind: raw.kind,
      fullText: raw.fullText,
      content: packFullTextCache(url, raw.kind, raw.fullText),
    };
  }
  return raw;
}

module.exports = {
  buscarUrl,
  toClaudeResult,
  unpackFullTextCache,
  // Expuesto para pruebas / scripts de diagnóstico del rank.
  selectRelevantExtracts,
};
