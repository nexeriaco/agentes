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

// Dado un agentId y el mensaje del ciudadano, devuelve las instrucciones
// activas de ese agente semánticamente más relevantes (embedding de la
// pregunta vs. embedding de cada instrucción, vía pgvector vía la RPC
// match_agent_instructions), limitadas a las MATCH_COUNT más similares y
// filtradas por SIMILARITY_THRESHOLD. Si ninguna supera el umbral, devuelve
// un array vacío: quien construya el prompt debe tratarlo como "no hay
// información suficiente", no como "no hay instrucciones para este agente".
async function getRelevantInstructions(agentId, citizenMessage) {
  const queryEmbedding = await embedQuery(citizenMessage);

  const { data, error } = await supabase.rpc('match_agent_instructions', {
    query_embedding: queryEmbedding,
    p_agent_id: agentId,
    match_count: MATCH_COUNT,
  });

  if (error) throw error;

  return data.filter((row) => row.similarity >= SIMILARITY_THRESHOLD);
}

module.exports = { getRelevantInstructions, SIMILARITY_THRESHOLD };
