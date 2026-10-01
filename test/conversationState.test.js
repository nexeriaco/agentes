const test = require('node:test');
const assert = require('node:assert/strict');

// conversationState.js crea el cliente de Supabase al cargarse; con valores
// ficticios no hace ninguna petición (estos tests solo usan funciones puras).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-key';

const {
  buildConversationState,
  emptyConversationState,
  pendingOptionsState,
  resolveNextState,
} = require('../src/services/conversationState');

const CEIP_SOURCE = {
  tabla: 'agent_instructions',
  id: '11111111-1111-4111-8111-111111111111',
  case_group: 'Educación',
  case_subgroup: 'CEIP Monte Anaor - teléfono, contacto (colegio)',
  response_mode: 'directo',
};

const previousState = buildConversationState(CEIP_SOURCE, 'información del CEIP Monte Anaor');

test('resolveNextState: una fuente identificada pasa a ser el tema activo', () => {
  const next = resolveNextState({
    source: CEIP_SOURCE,
    citizenMessage: 'y su teléfono',
    previousState: null,
    wasFollowUp: false,
  });
  assert.equal(next.source_id, CEIP_SOURCE.id);
  assert.match(next.context_text, /CEIP Monte Anaor/);
  assert.deepEqual(next.pending_options, []);
});

test('resolveNextState: sin fuente, un seguimiento conserva el tema', () => {
  const next = resolveNextState({
    source: null,
    citizenMessage: 'y su horario',
    previousState: { ...previousState, pending_options: [{ label: 'x' }] },
    wasFollowUp: true,
  });
  assert.equal(next.source_id, previousState.source_id);
  assert.equal(next.context_text, previousState.context_text);
  assert.deepEqual(next.pending_options, []);
});

test('resolveNextState: sin fuente, un tema nuevo limpia el estado', () => {
  const next = resolveNextState({
    source: null,
    citizenMessage: 'cómo recicla un sofá',
    previousState,
    wasFollowUp: false,
  });
  assert.deepEqual(next, emptyConversationState());
});

test('resolveNextState: una fuente sin título no pisa el tema activo', () => {
  const next = resolveNextState({
    source: { tabla: 'agent_instructions', id: 'no-esta-en-el-turno' },
    citizenMessage: 'y su horario',
    previousState,
    wasFollowUp: true,
  });
  assert.equal(next.source_id, previousState.source_id);
});

test('resolveNextState: sin seguimiento ni estado previo queda vacío', () => {
  const next = resolveNextState({
    source: null,
    citizenMessage: 'hola',
    previousState: null,
    wasFollowUp: true,
  });
  assert.deepEqual(next, emptyConversationState());
});

test('pendingOptionsState: la aclaración descarta la ficha anterior', () => {
  const options = [{ source_kind: 'instruction', source_id: 'x', label: 'A' }];
  const state = pendingOptionsState(options);
  assert.equal(state.source_id, null);
  assert.equal(state.context_text, null);
  assert.deepEqual(state.pending_options, options);
  assert.deepEqual(pendingOptionsState([]), emptyConversationState());
});
