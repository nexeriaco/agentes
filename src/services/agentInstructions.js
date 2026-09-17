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

// Dado un agentId, el mensaje del ciudadano y (opcionalmente) el historial
// reciente de la conversación, devuelve las instrucciones más relevantes.
// Primero se prueba con el mensaje tal cual. Si no hay match, el mensaje
// puede ser una respuesta corta o ambigua fuera de contexto ("el segundo",
// "el San Roque", "sí") a una pregunta de aclaración que el propio bot
// acaba de hacer (p. ej. tras detectar varios casos posibles, ver el paso 2
// de buildFixedSystemPrompt en answer.js): por sí sola no se parece
// semánticamente a ninguna fila, pero el último mensaje del bot ya contiene
// los nombres/términos concretos de las opciones. En ese caso se reintenta
// concatenando ese último mensaje del bot con el mensaje del ciudadano, para
// que la búsqueda semántica tenga ese contexto disponible.
async function getRelevantInstructions(agentId, citizenMessage, history = []) {
  const directMatches = await matchInstructions(agentId, citizenMessage);
  if (directMatches.length > 0) return directMatches;

  let lastBotMessage = null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === 'assistant') {
      lastBotMessage = history[i];
      break;
    }
  }
  if (!lastBotMessage) return directMatches;

  return matchInstructions(agentId, `${lastBotMessage.content}\n${citizenMessage}`);
}

module.exports = { getRelevantInstructions, SIMILARITY_THRESHOLD };
