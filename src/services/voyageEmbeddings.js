// Cliente mínimo para la API de embeddings de Voyage AI.
// Modelo voyage-4-lite: 1024 dimensiones, el más barato del catálogo,
// con 200M de tokens gratis — usado tanto por el backfill como por el
// flujo de respuesta en tiempo real (ambos deben usar el mismo modelo
// para que los vectores sean comparables).
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-4-lite';

// Límites pensados para consultas interactivas: una caída puntual no debe
// bloquear la conversación varios minutos. El backfill también puede usar
// este cliente, pero sus scripts ya espaciaban las peticiones por separado.
const MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 1000;
const NETWORK_RETRY_BACKOFF_MS = 750;
const MAX_RETRY_DELAY_MS = 4000;
const REQUEST_TIMEOUT_MS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildInstructionText({ case_group, case_subgroup, instruction }) {
  return `Concejalía: ${case_group}. Subtema: ${case_subgroup}. ${instruction}`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// input_type: 'document' para texto que se indexa (las instrucciones),
// 'query' para el texto de búsqueda (la pregunta del ciudadano). Voyage
// optimiza el embedding de forma distinta según el rol del texto.
async function embed(texts, inputType) {
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error('Falta la variable de entorno VOYAGE_API_KEY');
  }

  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetchWithTimeout(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          input: texts,
          model: VOYAGE_MODEL,
          input_type: inputType,
        }),
      });
    } catch (err) {
      // Fallo de red (DNS, timeout de conexión...), no de la API en sí.
      if (attempt < MAX_RETRIES) {
        await sleep(NETWORK_RETRY_BACKOFF_MS * (attempt + 1));
        continue;
      }
      throw err;
    }

    if (response.ok) {
      const json = await response.json();
      // La API devuelve los resultados en el mismo orden que `texts`.
      return json.data.map((item) => item.embedding);
    }

    const body = await response.text();
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterHeader = Number(response.headers.get('retry-after'));
      const requestedBackoffMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : DEFAULT_BACKOFF_MS * (attempt + 1);
      const backoffMs = Math.min(requestedBackoffMs, MAX_RETRY_DELAY_MS);
      await sleep(backoffMs);
      continue;
    }

    throw new Error(`Voyage API error ${response.status}: ${body}`);
  }
}

async function embedDocuments(texts) {
  return embed(texts, 'document');
}

async function embedQuery(text) {
  const [embedding] = await embed([text], 'query');
  return embedding;
}

// Varias queries en una sola llamada (mismo orden que `texts`).
async function embedQueries(texts) {
  if (!texts.length) return [];
  return embed(texts, 'query');
}

module.exports = {
  buildInstructionText,
  embedDocuments,
  embedQuery,
  embedQueries,
  VOYAGE_MODEL,
};
