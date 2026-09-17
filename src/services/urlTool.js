const { PDFParse } = require('pdf-parse');
const { compile } = require('html-to-text');

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const FETCH_TIMEOUT_MS = 15000;
const MAX_TEXT_CHARS = 8000; // recorte de texto devuelto a Claude (página o PDF)
const MIN_PDF_TEXT_CHARS = 40; // por debajo de esto, se asume PDF escaneado sin capa de texto
const MAX_SCREENSHOT_PAGES = 8;

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

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

// Descarga con límite de tamaño y timeout. No lanza por HTTP no-2xx ni por
// exceso de tamaño: en ambos casos devuelve { error } para que el llamador
// lo convierta en un tool_result explicativo en vez de romper el flujo.
async function fetchWithLimit(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return { error: `No se pudo acceder a la URL (HTTP ${response.status}).` };
  }

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

function handleHtml(buffer, url) {
  const text = convertHtml(buffer.toString('utf8'));
  const truncated = text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n[...contenido recortado...]` : text;
  return textResult(`Contenido de la página ${url}:\n\n${truncated}`);
}

async function handlePdf(buffer, url) {
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    const trimmed = (text || '').trim();

    if (trimmed.length >= MIN_PDF_TEXT_CHARS) {
      const truncated =
        trimmed.length > MAX_TEXT_CHARS ? `${trimmed.slice(0, MAX_TEXT_CHARS)}\n[...contenido recortado...]` : trimmed;
      return textResult(`Texto extraído del PDF ${url}:\n\n${truncated}`);
    }

    // Sin capa de texto (probable escaneo): se renderizan las páginas como
    // imágenes para que Claude las lea visualmente.
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
      content: [
        {
          type: 'text',
          text: `El PDF ${url} no tiene texto extraíble (parece un documento escaneado). Aquí tienes sus páginas (${imageBlocks.length} de ${totalPages}) como imágenes para que las leas visualmente:`,
        },
        ...imageBlocks,
      ],
    };
  } finally {
    await parser.destroy();
  }
}

// Ejecutor real de la tool "buscar_url": descarga la URL y devuelve su
// contenido en el formato que espera un tool_result de la API de Anthropic.
// Nunca lanza: cualquier fallo se traduce en un bloque de texto explicativo.
async function buscarUrl(url) {
  let fetched;
  try {
    fetched = await fetchWithLimit(url);
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'se agotó el tiempo de espera' : err.message;
    return textResult(`No se pudo acceder a la URL ${url}: ${reason}.`);
  }

  if (fetched.error) {
    return textResult(fetched.error);
  }

  const isPdf = fetched.contentType.includes('application/pdf') || url.toLowerCase().split('?')[0].endsWith('.pdf');

  try {
    return isPdf ? await handlePdf(fetched.buffer, url) : handleHtml(fetched.buffer, url);
  } catch (err) {
    return textResult(`No se pudo procesar el contenido de ${url}: ${err.message}`);
  }
}

module.exports = { buscarUrl };
