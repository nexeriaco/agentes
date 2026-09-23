// Cierre fijo ante agradecimientos/despedidas (sin buscar fichas ni Claude).
// Si no se cortocircuita, un "gracias" sin match directo reutilizaría el
// tema anterior vía el enriquecimiento por contexto en agentInstructions.
const POLITE_CLOSING_ANSWER =
  'Gracias a ti. Cualquier cosa que necesites, no dudes en preguntar.';

// True si el mensaje es solo un gracias o una despedida (no una pregunta).
function isPoliteClosingMessage(message) {
  const text = String(message || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[.!?¡¿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length > 48) return false;

  if (/^(muchas\s+)?gracias(\s+(mil|de antemano|por todo|por la (ayuda|info|informacion)))?$/.test(text)) {
    return true;
  }
  if (/^(ok|vale|perfecto|muy bien|genial)[, ]*(muchas\s+)?gracias$/.test(text)) {
    return true;
  }
  if (/^(adios|hasta luego|hasta pronto|hasta manana|chao|bye|nos vemos|buen dia|buenas noches|que tengas buen dia)$/.test(text)) {
    return true;
  }
  return false;
}

module.exports = { isPoliteClosingMessage, POLITE_CLOSING_ANSWER };
