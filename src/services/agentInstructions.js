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
//
// Siempre se busca primero solo con el mensaje del ciudadano. Si hay matches
// por encima de SIMILARITY_THRESHOLD, se usan tal cual: no se mezcla el
// mensaje previo del bot. Las respuestas `directo` son textos largos casi
// idénticos a la ficha; embeberlos en la query hace que la ficha anterior
// gane otra vez aunque el ciudadano haya cambiado de tema (staging
// 2026-09-23: "plenos" → "farola rota" devolvía plenos; antes también
// "fotos multa" → "recibos pendientes", y umbrales por longitud/prefijo
// trataban como follow-up preguntas reales cortas).
//
// Solo si el match directo está vacío Y hay un mensaje previo del assistant
// se hace una segunda búsqueda con contexto (último bot + mensaje actual).
// Eso cubre seguimientos ambiguos donde la búsqueda sola falla (p. ej.
// "¿y el teléfono?" tras la dirección del ayuntamiento).
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

module.exports = {
  getRelevantInstructions,
  SIMILARITY_THRESHOLD,
};
