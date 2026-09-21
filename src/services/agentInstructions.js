const supabase = require('../supabase/client');
const { embedQuery } = require('./voyageEmbeddings');

// Nº máximo de instrucciones que se piden a la RPC de similitud.
const MATCH_COUNT = 5;

// Por debajo de esta similitud coseno se considera que la instrucción no
// tiene relación real con la pregunta y se descarta, en vez de forzar una
// respuesta con datos irrelevantes. Calibrado empíricamente con voyage-4-lite
// sobre datos reales de agent_instructions: preguntas parafraseadas con
// sinónimos sobre casos que sí existen puntuaron entre 0.43 y 0.66 (p.ej.
// "¿a qué hora abre la farmacia esta noche?" → 0.444 sobre "Farmacias de
// guardia"), mientras que preguntas sin ningún caso real relacionado nunca
// superaron 0.35. 0.5 (el valor "de ejemplo" inicial) resultó demasiado
// estricto: descartaba coincidencias correctas como la de la farmacia. 0.4
// deja margen bajo el hueco real (~0.35 a ~0.43) sin colar negativos.
const SIMILARITY_THRESHOLD = 0.4;

// Dado un agentId y un texto de búsqueda ya resuelto, devuelve las
// instrucciones activas de ese agente semánticamente más relevantes
// (embedding del texto vs. embedding de cada instrucción, vía pgvector vía
// la RPC match_agent_instructions), limitadas a las MATCH_COUNT más
// similares y filtradas por SIMILARITY_THRESHOLD. Si ninguna supera el
// umbral, devuelve un array vacío: quien construya el prompt debe tratarlo
// como "no hay información suficiente", no como "no hay instrucciones para
// este agente".
async function matchInstructions(agentId, queryText) {
  const queryEmbedding = await embedQuery(queryText);

  const { data, error } = await supabase.rpc('match_agent_instructions', {
    query_embedding: queryEmbedding,
    p_agent_id: agentId,
    match_count: MATCH_COUNT,
  });

  if (error) throw error;

  return data.filter((row) => row.similarity >= SIMILARITY_THRESHOLD);
}

// Seguimientos cortos/ambiguos donde la búsqueda solo con el mensaje del
// ciudadano falla (p. ej. "¿y el teléfono?" tras hablar del ayuntamiento).
// Preguntas auto-contenidas NO deben mezclarse con el mensaje previo del
// bot: las respuestas `directo` son textos largos casi idénticos a la ficha,
// y embeberlos en la query hace que la ficha anterior gane otra vez aunque
// el ciudadano haya cambiado de tema (caso real: "fotos multa" → luego
// "recibos pendientes" seguía devolviendo fotos multa con sim aún más alta).
const FOLLOWUP_MAX_CHARS = 25;
const FOLLOWUP_PREFIX =
  /^(¿?\s*y\b|sí\b|si\b|ok\b|vale\b|ese\b|esa\b|eso\b|el\s+segundo|la\s+primera|más\s+info|y\s+eso)/i;

function isLikelyShortFollowUp(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (text.length <= FOLLOWUP_MAX_CHARS) return true;
  return FOLLOWUP_PREFIX.test(text);
}

// Dado un agentId, el mensaje del ciudadano y (opcionalmente) el historial
// reciente de la conversación, devuelve las instrucciones más relevantes.
//
// Por defecto solo se busca con el mensaje del ciudadano. Si hay un mensaje
// previo del bot Y el mensaje actual parece un seguimiento corto/ambiguo
// ("¿y el teléfono?", "sí", "el segundo"), se hace además una búsqueda con
// contexto (último mensaje del bot + mensaje del ciudadano) y se combinan
// ambas. Eso cubre el caso real de producción en el que "¿y el teléfono?"
// tras preguntar por la dirección del ayuntamiento devolvía teléfonos de
// otros departamentos y Claude acababa inventando uno.
//
// No se combina contexto en preguntas nuevas auto-contenidas: el texto
// previo del bot (sobre todo en mode=directo) envenenaría el embedding.
async function getRelevantInstructions(agentId, citizenMessage, history = []) {
  const directMatches = await matchInstructions(agentId, citizenMessage);

  if (!isLikelyShortFollowUp(citizenMessage)) return directMatches;

  let lastBotMessage = null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === 'assistant') {
      lastBotMessage = history[i];
      break;
    }
  }
  if (!lastBotMessage) return directMatches;

  const contextMatches = await matchInstructions(agentId, `${lastBotMessage.content}\n${citizenMessage}`);

  const bestById = new Map();
  for (const row of [...directMatches, ...contextMatches]) {
    const existing = bestById.get(row.id);
    if (!existing || row.similarity > existing.similarity) {
      bestById.set(row.id, row);
    }
  }

  return [...bestById.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MATCH_COUNT);
}

module.exports = {
  getRelevantInstructions,
  SIMILARITY_THRESHOLD,
  isLikelyShortFollowUp,
};
