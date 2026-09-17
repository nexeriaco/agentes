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
// Además de la búsqueda simple (solo el mensaje del ciudadano), si hay un
// mensaje previo del bot en el historial se hace SIEMPRE también una
// búsqueda con contexto (ese último mensaje del bot + el mensaje del
// ciudadano), y se combinan los resultados de ambas. No basta con reintentar
// con contexto solo cuando la búsqueda simple no encuentra nada: un mensaje
// de seguimiento corto y genérico ("¿y el teléfono?", "sí", "el segundo")
// puede SÍ encontrar candidatas por sí solo — p. ej. muchas filas de
// "teléfono, contacto" de departamentos que no tienen nada que ver — sin que
// ninguna sea la correcta, y sin encontrar nunca la fila que sí encaja con
// el contexto real de la conversación (caso real detectado en producción:
// "¿y el teléfono?" tras preguntar por la dirección del ayuntamiento devolvió
// diez filas de teléfono de otros departamentos y ninguna del ayuntamiento,
// y Claude, con esas filas irrelevantes delante y el hilo de la conversación,
// acabó inventándose un teléfono). Al combinar ambas búsquedas, la fila
// relevante para el contexto tiene ocasión de aparecer junto a las de la
// búsqueda simple, en vez de competir a ciegas por las MATCH_COUNT plazas de
// una sola búsqueda.
//
// Si no hay ningún mensaje del bot en el historial (primer mensaje de la
// conversación), no hay contexto que combinar: se usa solo la búsqueda
// simple, sin cambios respecto al comportamiento anterior.
async function getRelevantInstructions(agentId, citizenMessage, history = []) {
  const directMatches = await matchInstructions(agentId, citizenMessage);

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

module.exports = { getRelevantInstructions, SIMILARITY_THRESHOLD };
