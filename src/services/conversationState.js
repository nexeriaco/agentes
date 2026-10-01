const supabase = require('../supabase/client');

const STATE_TTL_MS = 45 * 60 * 1000;

function normalizeStateText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function inferIntent(citizenMessage, contextText = '') {
  const text = normalizeStateText(`${citizenMessage} ${contextText}`);
  if (/\b(telefono|numero|llamar|contacto|contactar|correo|email)\b/.test(text)) {
    return 'contacto';
  }
  if (/\b(horario|hora|abre|cierra|abierto|cerrado)\b/.test(text)) {
    return 'horario';
  }
  if (/\b(donde|ubicacion|direccion|situado|situada)\b/.test(text)) {
    return 'ubicacion';
  }
  if (/\b(como|tramite|solicitar|requisitos|reserva|cita|inscrib)\b/.test(text)) {
    return 'tramite';
  }
  if (/\b(ordenanza|norma|reglamento|tasa|precio|articulo)\b/.test(text)) {
    return 'norma';
  }
  return 'informacion';
}

function deriveEntityLabel(source) {
  if (!source) return null;
  if (source.tabla === 'agent_events') return source.title || null;

  const subgroup = String(source.case_subgroup || '').trim();
  const withoutPrefix = subgroup.replace(/^(contacto|tramite|norma)\s*[·:]\s*/i, '');
  const withoutDetails = withoutPrefix.split('(')[0].trim();
  const beforeDash = withoutDetails.split(/\s+-\s+/)[0].trim();
  if (beforeDash) {
    const afterArticle = beforeDash.match(
      /(?:del|de la|de|en el|en la)\s+(.+)$/i
    );
    return afterArticle ? afterArticle[1].trim() : beforeDash;
  }
  return source.case_group || null;
}

function buildConversationState(source, citizenMessage, pendingOptions = []) {
  if (!source && pendingOptions.length === 0) return null;

  if (!source) {
    return {
      source_kind: null,
      source_id: null,
      entity_label: null,
      context_text: null,
      intent: null,
      pending_options: pendingOptions,
    };
  }

  const sourceKind = source.tabla === 'agent_events' ? 'event' : 'instruction';
  const contextText = sourceKind === 'event'
    ? source.title
    : [source.case_group, source.case_subgroup].filter(Boolean).join(' › ');

  return {
    source_kind: sourceKind,
    source_id: source.id ? String(source.id) : null,
    entity_label: deriveEntityLabel(source),
    context_text: contextText || null,
    intent: inferIntent(citizenMessage, contextText),
    pending_options: pendingOptions,
  };
}

function mergePendingOptions(state, pendingOptions) {
  if (!state && pendingOptions.length === 0) return null;
  return {
    source_kind: state ? state.source_kind : null,
    source_id: state ? state.source_id : null,
    entity_label: state ? state.entity_label : null,
    context_text: state ? state.context_text : null,
    intent: state ? state.intent : null,
    pending_options: pendingOptions,
  };
}

function emptyConversationState() {
  return {
    source_kind: null,
    source_id: null,
    entity_label: null,
    context_text: null,
    intent: null,
    pending_options: [],
  };
}

function normalizeStateRow(row) {
  if (!row) return null;
  return {
    source_kind: row.source_kind || null,
    source_id: row.source_id || null,
    entity_label: row.entity_label || null,
    context_text: row.context_text || null,
    intent: row.intent || null,
    pending_options: Array.isArray(row.pending_options) ? row.pending_options : [],
    updated_at: row.updated_at || null,
  };
}

async function getConversationState(agentId, chatId) {
  if (chatId == null) return null;

  const { data, error } = await supabase
    .from('conversation_state')
    .select(
      'source_kind, source_id, entity_label, context_text, intent, pending_options, updated_at'
    )
    .eq('agent_id', agentId)
    .eq('chat_id', String(chatId))
    .maybeSingle();

  if (error) {
    // El estado es una mejora de memoria, no debe impedir responder si
    // la tabla aún no existe o Supabase tiene un fallo transitorio.
    console.error('Error leyendo estado conversacional:', error);
    return null;
  }

  const state = normalizeStateRow(data);
  if (!state || !state.updated_at) return state;

  const age = Date.now() - new Date(state.updated_at).getTime();
  return age > STATE_TTL_MS ? null : state;
}

async function saveConversationState(agentId, chatId, state) {
  if (chatId == null || !state) return;

  const payload = {
    agent_id: agentId,
    chat_id: String(chatId),
    source_kind: state.source_kind || null,
    source_id: state.source_id || null,
    entity_label: state.entity_label || null,
    context_text: state.context_text || null,
    intent: state.intent || null,
    pending_options: Array.isArray(state.pending_options)
      ? state.pending_options
      : [],
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('conversation_state')
    .upsert(payload, { onConflict: 'agent_id,chat_id' });

  if (error) throw error;
}

async function clearConversationState(agentId, chatId) {
  if (chatId == null) return;

  const { error } = await supabase
    .from('conversation_state')
    .delete()
    .eq('agent_id', agentId)
    .eq('chat_id', String(chatId));

  if (error) throw error;
}

module.exports = {
  STATE_TTL_MS,
  buildConversationState,
  clearConversationState,
  emptyConversationState,
  getConversationState,
  mergePendingOptions,
  saveConversationState,
};
