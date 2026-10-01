const test = require('node:test');
const assert = require('node:assert/strict');

// generateAnswer de punta a punta, con Supabase, Voyage, Claude y las tablas
// auxiliares sustituidos. Cubre el caso real: tras hablar de un centro, un
// seguimiento corto debe resolverse con ese centro.

const rpcQueries = [];
let claudeCalls = 0;
let claudeText = 'No tengo ese dato.\nFUENTE:ninguna';
const logs = [];

function stubModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function row(id, group, entity, similarity) {
  return {
    id,
    case_group: group,
    case_subgroup: `${entity} - teléfono, contacto (centro; teléfono de ${entity}, número de ${entity})`,
    instruction: `El teléfono de ${entity} es el 968 000 000.`,
    associated_url: null,
    allow_url_reading: false,
    response_mode: 'directo',
    similarity,
  };
}

const CEIP = row('ceip-id', 'Educación', 'CEIP Monte Anaor', 0.9);
const IES = row('ies-id', 'Educación', 'IES Villa de Alguazas', 0.62);
const BIBLIOTECA = row('biblio-id', 'Cultura y Turismo', 'Biblioteca Municipal', 0.88);

let history = [
  { role: 'user', content: 'información del CEIP Monte Anaor' },
  { role: 'assistant', content: 'El teléfono de CEIP Monte Anaor es el 968 000 000.' },
];
let storedState = null;

stubModule('../src/supabase/client', {
  rpc: async (_name, args) => {
    const text = args.query_embedding;
    rpcQueries.push(text);
    if (text.includes('Monte Anaor')) return { data: [CEIP, IES], error: null };
    if (text.toLowerCase().includes('biblioteca')) return { data: [BIBLIOTECA, IES], error: null };
    // Un "teléfono" suelto trae fichas CONTACTO de cualquier entidad.
    const noise = [IES, BIBLIOTECA, CEIP].map((r, i) => ({ ...r, similarity: 0.56 - i * 0.01 }));
    return { data: noise, error: null };
  },
});
stubModule('../src/services/voyageEmbeddings', {
  embedQuery: async (text) => text,
  embedQueries: async (texts) => texts.map((text) => [text.length, 1]),
});
stubModule('../src/anthropic/client', {
  messages: {
    create: async () => {
      claudeCalls += 1;
      return {
        content: [{ type: 'text', text: claudeText }],
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    },
  },
});
stubModule('../src/services/agents', {
  getAgent: async () => ({ id: 'agent-1', tone_instructions: '', escalation_contact: '900 000 000' }),
});
stubModule('../src/services/agentEvents', { getRelevantEvents: async () => [] });
stubModule('../src/services/escalationContacts', { getEscalationContacts: async () => [] });
stubModule('../src/services/conversationHistory', { getRecentHistory: async () => history });

// Estado y trazas reales, salvo el acceso a Supabase y la salida por consola.
const conversationState = require('../src/services/conversationState');
conversationState.getConversationState = async () => storedState;
const consultaLog = require('../src/services/consultaLog');
consultaLog.logConsulta = (payload) => logs.push(payload);

const { generateAnswer } = require('../src/services/answer');

function stateOf(row) {
  return conversationState.buildConversationState(
    { tabla: 'agent_instructions', ...row },
    'información del CEIP Monte Anaor'
  );
}

function reset() {
  rpcQueries.length = 0;
  logs.length = 0;
  claudeCalls = 0;
  claudeText = 'No tengo ese dato.\nFUENTE:ninguna';
  storedState = stateOf(CEIP);
}

test('"y su número de teléfono" se responde con el teléfono del centro, sin Claude', async () => {
  reset();
  const { answer, conversationState: next } = await generateAnswer('y su número de teléfono', 'agent-1', 42);

  assert.equal(answer, CEIP.instruction);
  assert.equal(claudeCalls, 0, 'no debe llamar a Claude');
  assert.equal(logs.at(-1).modo, 'directo');
  assert.equal(logs.at(-1).motivo, 'directo_follow_up_entity');
  assert.equal(logs.at(-1).state_follow_up, true);
  assert.equal(next.source_id, CEIP.id);
});

test('seguimientos sin "y" ni prefijo conocido también resuelven el centro', async () => {
  for (const message of ['su teléfono', 'dame su teléfono', 'me das el teléfono?', 'pásame el contacto']) {
    reset();
    const { answer } = await generateAnswer(message, 'agent-1', 42);
    assert.equal(answer, CEIP.instruction, message);
    assert.equal(claudeCalls, 0, message);
  }
});

test('el tema activo manda sobre la similitud: se responde el centro del estado', async () => {
  reset();
  storedState = stateOf(IES);
  // Con el estado en el IES, la búsqueda trae fichas CONTACTO de varias
  // entidades con similitud casi igual; el teléfono que se ataja es el del
  // tema activo (IES), nunca el de la ficha que quede primera por azar.
  const { answer } = await generateAnswer('y su teléfono', 'agent-1', 42);
  assert.equal(answer, IES.instruction);
  assert.equal(claudeCalls, 0);
});

test('un dato distinto del teléfono pasa a Claude y no se contesta con un teléfono', async () => {
  reset();
  const { answer, conversationState: next } = await generateAnswer('y su correo', 'agent-1', 42);

  assert.equal(claudeCalls, 1);
  assert.notEqual(answer, CEIP.instruction);
  // La respuesta sin fuente ("ninguna") no borra el tema: sigue siendo el CEIP.
  assert.equal(next.source_id, CEIP.id);
  assert.equal(next.context_text, storedState.context_text);
});

test('un seguimiento posterior sigue funcionando tras una respuesta sin fuente', async () => {
  reset();
  const first = await generateAnswer('y su correo', 'agent-1', 42);
  storedState = first.conversationState;

  const second = await generateAnswer('y su teléfono', 'agent-1', 42);
  assert.equal(second.answer, CEIP.instruction);
});

test('un tema nuevo con la misma forma ("teléfono de la biblioteca") no se pega al centro', async () => {
  reset();
  const { answer, conversationState: next } = await generateAnswer('teléfono de la biblioteca', 'agent-1', 42);

  assert.equal(answer, BIBLIOTECA.instruction);
  assert.equal(logs.at(-1).state_follow_up, false);
  assert.equal(next.source_id, BIBLIOTECA.id);
});

test('un tema nuevo sin fuente limpia el estado en vez de conservar el anterior', async () => {
  reset();
  const { conversationState: next } = await generateAnswer('quiero reciclar un sofá viejo', 'agent-1', 42);

  assert.equal(claudeCalls, 1);
  assert.equal(next.source_id, null);
  assert.equal(next.context_text, null);
});
