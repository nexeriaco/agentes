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
const TOP_CHUNKS = 5;
const MIN_PDF_TEXT_CHARS = 40;
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

function scoreChunk(chunk, queryTokens) {
  const normalized = chunk
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  let score = 0;
  for (const token of queryTokens) {
    if (normalized.includes(token)) score += 1;
  }
  // Ligero empujón a trozos con enlaces (trámites que necesitan el href).
  if (/https?:\/\//i.test(chunk)) score += 0.25;
  return score;
}

// Elige los trozos más alineados con la pregunta. Si la query no aporta
// tokens o ningún chunk puntúa, cae al inicio del documento (comportamiento
// previo). Conserva vecinos con http junto a chunks buenos.
function selectRelevantExtracts(fullText, query) {
  const text = String(fullText || '');
  if (!text) return '';

  const queryTokens = [...new Set(tokenize(query || ''))];
  if (queryTokens.length === 0) {
    return text.length > MAX_RETURN_CHARS
      ? `${text.slice(0, MAX_RETURN_CHARS)}\n[...contenido recortado...]`
      : text;
  }

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return '';

  const scored = chunks.map((chunk, index) => ({
    chunk,
    index,
    score: scoreChunk(chunk, queryTokens),
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const selectedIndexes = new Set();
  let usedChars = 0;

  for (const item of scored) {
    if (item.score <= 0) break;
    if (selectedIndexes.size >= TOP_CHUNKS) break;

    const candidates = [item.index];
    if (item.index > 0 && /https?:\/\//i.test(chunks[item.index - 1])) {
      candidates.unshift(item.index - 1);
    }
    if (item.index < chunks.length - 1 && /https?:\/\//i.test(chunks[item.index + 1])) {
      candidates.push(item.index + 1);
    }

    for (const idx of candidates) {
      if (selectedIndexes.has(idx)) continue;
      const nextLen = chunks[idx].length + (usedChars > 0 ? 2 : 0);
      if (usedChars + nextLen > MAX_RETURN_CHARS && selectedIndexes.size > 0) continue;
      selectedIndexes.add(idx);
      usedChars += nextLen;
      if (selectedIndexes.size >= TOP_CHUNKS + 2) break;
    }
  }

  if (selectedIndexes.size === 0) {
    return text.length > MAX_RETURN_CHARS
      ? `${text.slice(0, MAX_RETURN_CHARS)}\n[...contenido recortado...]`
      : text;
  }

  const ordered = [...selectedIndexes].sort((a, b) => a - b);
  let extract = ordered.map((i) => chunks[i]).join('\n\n---\n\n');
  if (extract.length > MAX_RETURN_CHARS) {
    extract = `${extract.slice(0, MAX_RETURN_CHARS)}\n[...contenido recortado...]`;
  }
  return extract;
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
    const { text } = await parser.getText();
    const trimmed = (text || '').trim();

    if (trimmed.length >= MIN_PDF_TEXT_CHARS) {
      return { kind: 'pdf', fullText: clipForCache(trimmed) };
    }

    const info = await parser.getInfo();
    const totalPages = info.total || 1;
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
};
