const supabase = require('../supabase/client');
const { embedQuery, embedQueries } = require('./voyageEmbeddings');
const {
  getPendingOptionIndex,
  isStateFollowUpMessage,
  namesNewTopic,
} = require('./followUp');

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

// Seguimientos elípticos frecuentes que empiezan directamente por el dato
// pedido: "el teléfono", "la dirección", "otro horario"...
const SHORT_FOLLOWUP_PREFIX =
  /^(¿?\s*(el|la|los|las|un|una|otro|otra|teléfono|telefono|correo|email|dirección|direccion)\b)/i;

// Último mensaje del bot parece una aclaración (FUENTE ya no está en historial).
const BOT_CLARIFICATION_RE =
  /¿[^?\n]{3,220}\?|\?\s*$|te refieres|necesitas.{0,80}\bo\b|a otro|o a |cuál de|cual de|¿a o b\b/i;

// Pregunta nueva autocontenida: no forzar modo aclaración.
const STANDALONE_QUESTION_RE =
  /^(¿?\s*)(cuál|cual|cuánto|cuanto|dónde|donde|cómo|como|qué|que|quién|quien|horario|teléfono|telefono|email|correo|precio|precios|cuánto\s+cuesta|cuanto\s+cuesta)\b/i;

async function getInstructionById(agentId, instructionId) {
  const { data, error } = await supabase
    .from('agent_instructions')
    .select(
      'id, agent_id, case_group, instruction, associated_url, '
        + 'allow_url_reading, active, case_subgroup, response_mode'
    )
    .eq('id', instructionId)
    .eq('agent_id', agentId)
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;
  return data ? { ...data, similarity: 1 } : null;
}

// Dado un agentId y un texto de búsqueda ya resuelto, devuelve las
// instrucciones activas de ese agente semánticamente más relevantes
// (embedding del texto vs. embedding de cada instrucción, vía pgvector vía
// la RPC match_agent_instructions), limitadas a las MATCH_COUNT más
// similares y filtradas por SIMILARITY_THRESHOLD. Si ninguna supera el
// umbral, devuelve un array vacío: quien construya el prompt debe tratarlo
// como "no hay información suficiente", no como "no hay instrucciones para
// este agente".
async function matchInstructions(agentId, queryText, options = {}) {
  const queryEmbedding = await embedQuery(queryText);

  const { data, error } = await supabase.rpc('match_agent_instructions', {
    query_embedding: queryEmbedding,
    p_agent_id: agentId,
    match_count: MATCH_COUNT,
  });

  if (error) throw error;

  if (options.retrievalMeta) {
    options.retrievalMeta.nearMatches = data.slice(0, MATCH_COUNT);
  }

  return data.filter((row) => row.similarity >= SIMILARITY_THRESHOLD);
}

// contextText (último mensaje del ciudadano + última respuesta del bot) sirve
// para no tratar como seguimiento un arranque elíptico que nombra algo nuevo:
// "teléfono de la biblioteca" tras hablar de un colegio es un tema nuevo, no
// "el teléfono" de aquel. Los cues explícitos ("y…", "ese", "también"…) no se
// vetan: ahí la decisión la toma la comparación de similitud (escape por gap).
function isLexicalFollowUp(message, contextText = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  if (FOLLOWUP_PREFIX.test(text)) return true;
  if (text.length > 42 || !SHORT_FOLLOWUP_PREFIX.test(text)) return false;
  return !contextText || !namesNewTopic(text, contextText);
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
// 0. Si parece un seguimiento, o el bot acaba de pedir aclaración, buscar
//    primero con «último USER + mensaje actual» (salvo escape por tema nuevo).
//    options.retrievalMeta.contextFollowUp = true si se aplica.
// 1. Si el mensaje es autocontenido, usar sus matches directos sin mezclar
//    historial.
// 2. Si no hay match directo, enriquecer SOLO si parece follow-up:
//    - cue léxico ("¿y el teléfono?", "sí", "ese", "el segundo"…), o
//    - mismo tema que el último mensaje del ciudadano (sim embedding >=
//      TOPIC_CONTINUITY_THRESHOLD).
// 3. Al enriquecer, concatenar último USER + mensaje actual — nunca el
//    texto `directo` del bot (envenena el embedding; staging: plenos →
//    "farola rota" devolvía plenos con sim ~0.72).
async function getRelevantInstructions(agentId, citizenMessage, history = [], options = {}) {
  const retrievalMeta = options.retrievalMeta || {};
  retrievalMeta.clarificationFollowUp = false;
  retrievalMeta.contextFollowUp = false;
  retrievalMeta.stateFollowUp = false;
  retrievalMeta.stateFollowUpDetected = false;

  const directMatches = options.directMatches !== undefined
    ? options.directMatches
    : await matchInstructions(agentId, citizenMessage);

  const lastUserMessage = findLastByRole(history, 'user');
  const awaitingClarification = isAwaitingClarificationReply(history, citizenMessage);
  const lastAssistantMessage = findLastByRole(history, 'assistant');
  const recentContext = [lastUserMessage, lastAssistantMessage]
    .filter(Boolean)
    .map((message) => message.content)
    .join(' ');
  const lexicalFollowUp = isLexicalFollowUp(citizenMessage, recentContext);
  const conversationState = options.conversationState;

  // Si el ciudadano está eligiendo una opción de una aclaración anterior,
  // resolver por ID evita que "el segundo" dependa de un embedding ambiguo.
  const pendingOptionIndex = conversationState
    && Array.isArray(conversationState.pending_options)
    ? getPendingOptionIndex(citizenMessage)
    : null;
  if (
    pendingOptionIndex != null
    && conversationState.pending_options[pendingOptionIndex]
  ) {
    const option = conversationState.pending_options[pendingOptionIndex];
    if (option.source_kind === 'instruction' && option.source_id) {
      const selected = await getInstructionById(agentId, option.source_id);
      if (selected) {
        retrievalMeta.contextFollowUp = true;
        retrievalMeta.clarificationFollowUp = true;
        retrievalMeta.stateFollowUp = true;
        return [selected];
      }
    }
  }

  // La entidad guardada es "pegajosa" y el dato solicitado es intercambiable:
  // "horario del Ecoparque" + "¿y el teléfono?" se convierte en una búsqueda
  // canónica que contiene ambos contextos. Si el mensaje nombra algo ajeno al
  // contexto guardado ("¿y la biblioteca?"), es un cambio de tema y se sigue
  // con la búsqueda normal (ver followUp.js).
  const stateFollowUp = Boolean(
    conversationState
    && conversationState.context_text
    && isStateFollowUpMessage(citizenMessage, conversationState.context_text)
  );
  if (stateFollowUp) {
    retrievalMeta.stateFollowUpDetected = true;
    const stateMatches = await matchInstructions(
      agentId,
      `${conversationState.context_text}\n${citizenMessage}`
    );
    if (stateMatches.length > 0) {
      retrievalMeta.contextFollowUp = true;
      // El tema activo viene de una respuesta real (hay ficha), no de una
      // aclaración pendiente: no se trata como respuesta a una aclaración.
      retrievalMeta.clarificationFollowUp = false;
      retrievalMeta.stateFollowUp = true;
      return stateMatches;
    }
  }

  // Resolver el contexto antes de aceptar una coincidencia directa cuando el
  // mensaje parece un seguimiento. Así "¿y el teléfono?" conserva el asunto
  // anterior, aunque exista una ficha CONTACTO genérica con match propio.
  if ((awaitingClarification || lexicalFollowUp) && lastUserMessage) {
    const enrichedMatches = await matchInstructions(
      agentId,
      `${lastUserMessage.content}\n${citizenMessage}`
    );

    if (!shouldPreferAloneOverEnriched(directMatches, enrichedMatches)) {
      if (enrichedMatches.length > 0) {
        retrievalMeta.contextFollowUp = true;
        retrievalMeta.clarificationFollowUp = awaitingClarification;
        return enrichedMatches;
      }
    }
    // Escape / sin hits en combo: seguir con lógica normal (directMatches).
  }

  if (directMatches.length > 0) return directMatches;

  if (!lastUserMessage) return directMatches;

  let enrichWithPreviousUser = lexicalFollowUp;
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
  isLexicalFollowUp,
  looksLikeBotClarification,
};
