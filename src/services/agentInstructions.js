const supabase = require('../supabase/client');
const { embedQuery, embedQueries } = require('./voyageEmbeddings');

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

// Similitud mínima entre el mensaje actual y el último del ciudadano para
// tratarlos como el mismo tema cuando el match directo falla y no hay cue
// léxico. Punto de partida a calibrar (staging 2026-09-23: enriquecer con
// el bot `directo` hacía ganar plenos a "farola rota" con sim ~0.72).
const TOPIC_CONTINUITY_THRESHOLD = 0.5;

// Si el match solo del mensaje nuevo gana al combo por este margen y es
// otra ficha → se trata como cambio de tema (no forzar aclaración).
const CLARIFICATION_TOPIC_ESCAPE_GAP = 0.08;

// Señales de seguimiento respecto al turno anterior (no temas nuevos cortos).
const FOLLOWUP_PREFIX =
  /^(¿?\s*y\b|sí\b|si\b|ok\b|vale\b|ese\b|esa\b|eso\b|esos\b|esas\b|el\s+primero|el\s+segundo|la\s+primera|la\s+segunda|más\s+info|más\s+detalles|y\s+eso|también\b|entonces\b|pero\b|sobre\s+eso|de\s+eso|lo\s+mismo)/i;

// Último mensaje del bot parece una aclaración (FUENTE ya no está en historial).
const BOT_CLARIFICATION_RE =
  /¿[^?\n]{3,220}\?|\?\s*$|te refieres|necesitas.{0,80}\bo\b|a otro|o a |cuál de|cual de|¿a o b\b/i;

// Pregunta nueva autocontenida: no forzar modo aclaración.
const STANDALONE_QUESTION_RE =
  /^(¿?\s*)(cuál|cual|cuánto|cuanto|dónde|donde|cómo|como|qué|que|quién|quien|horario|teléfono|telefono|email|correo|precio|precios|cuánto\s+cuesta|cuanto\s+cuesta)\b/i;

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

function isLexicalFollowUp(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  return FOLLOWUP_PREFIX.test(text);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function findLastByRole(history, role) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === role) return history[i];
  }
  return null;
}

function looksLikeBotClarification(assistantText) {
  const text = String(assistantText || '').trim();
  if (!text) return false;
  return BOT_CLARIFICATION_RE.test(text);
}

function looksLikeStandaloneQuestion(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (text.length >= 40) return true;
  if (STANDALONE_QUESTION_RE.test(text) && text.length >= 25) return true;
  return false;
}

// Tras una aclaración del bot: ¿forzar enriquecer con el mensaje USER previo?
function isAwaitingClarificationReply(history, citizenMessage) {
  const lastAssistant = findLastByRole(history, 'assistant');
  const lastUser = findLastByRole(history, 'user');
  if (!lastAssistant || !lastUser) return false;
  if (!looksLikeBotClarification(lastAssistant.content)) return false;
  if (looksLikeStandaloneQuestion(citizenMessage)) return false;
  return true;
}

// Cambio de tema: el mensaje solo gana claro al combo y apunta a otra ficha.
function shouldPreferAloneOverEnriched(aloneMatches, enrichedMatches) {
  if (!aloneMatches.length) return false;
  if (!enrichedMatches.length) return true;
  const aloneTop = aloneMatches[0];
  const enrichedTop = enrichedMatches[0];
  if (String(aloneTop.id) === String(enrichedTop.id)) return false;
  return aloneTop.similarity >= enrichedTop.similarity + CLARIFICATION_TOPIC_ESCAPE_GAP;
}

async function isSameTopicAsPreviousUser(citizenMessage, previousUserMessage) {
  const [currentEmb, previousEmb] = await embedQueries([
    citizenMessage,
    previousUserMessage,
  ]);
  return cosineSimilarity(currentEmb, previousEmb) >= TOPIC_CONTINUITY_THRESHOLD;
}

// Dado un agentId, el mensaje del ciudadano y (opcionalmente) el historial
// reciente de la conversación, devuelve las instrucciones más relevantes.
//
// 0. Si el bot acaba de pedir aclaración y el ciudadano responde corto:
//    buscar con «último USER + mensaje actual» (salvo escape por tema nuevo).
//    options.retrievalMeta.clarificationFollowUp = true si se aplica.
// 1. Siempre buscar solo con el mensaje actual. Si hay matches >= umbral,
//    usarlos (tema autocontenido; no mezclar historial) — salvo paso 0.
// 2. Si el match directo está vacío, enriquecer SOLO si parece follow-up:
//    - cue léxico ("¿y el teléfono?", "sí", "ese", "el segundo"…), o
//    - mismo tema que el último mensaje del ciudadano (sim embedding >=
//      TOPIC_CONTINUITY_THRESHOLD).
// 3. Al enriquecer, concatenar último USER + mensaje actual — nunca el
//    texto `directo` del bot (envenena el embedding; staging: plenos →
//    "farola rota" devolvía plenos con sim ~0.72).
async function getRelevantInstructions(agentId, citizenMessage, history = [], options = {}) {
  const retrievalMeta = options.retrievalMeta || {};
  retrievalMeta.clarificationFollowUp = false;

  const directMatches = options.directMatches !== undefined
    ? options.directMatches
    : await matchInstructions(agentId, citizenMessage);

  const lastUserMessage = findLastByRole(history, 'user');

  if (isAwaitingClarificationReply(history, citizenMessage) && lastUserMessage) {
    const enrichedMatches = await matchInstructions(
      agentId,
      `${lastUserMessage.content}\n${citizenMessage}`
    );

    if (!shouldPreferAloneOverEnriched(directMatches, enrichedMatches)) {
      if (enrichedMatches.length > 0) {
        retrievalMeta.clarificationFollowUp = true;
        return enrichedMatches;
      }
    }
    // Escape / sin hits en combo: seguir con lógica normal (directMatches).
  }

  if (directMatches.length > 0) return directMatches;

  if (!lastUserMessage) return directMatches;

  let enrichWithPreviousUser = isLexicalFollowUp(citizenMessage);
  if (!enrichWithPreviousUser) {
    enrichWithPreviousUser = await isSameTopicAsPreviousUser(
      citizenMessage,
      lastUserMessage.content
    );
  }
  if (!enrichWithPreviousUser) return directMatches;

  return matchInstructions(
    agentId,
    `${lastUserMessage.content}\n${citizenMessage}`
  );
}

module.exports = {
  getRelevantInstructions,
  matchInstructions,
  isAwaitingClarificationReply,
  looksLikeBotClarification,
};
