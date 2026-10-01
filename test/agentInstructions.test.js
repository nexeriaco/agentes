const test = require('node:test');
const assert = require('node:assert/strict');

// Flujo de recuperación con Supabase y Voyage sustituidos por stubs. El
// "embedding" de una consulta es el propio texto, así la RPC falsa puede decidir
// qué fichas devuelve según lo que se buscó.
const rpcCalls = [];
let rpcRows = () => [];
let instructionById = {};

const supabaseStub = {
  rpc: async (_name, args) => {
    rpcCalls.push(args.query_embedding);
    return { data: rpcRows(args.query_embedding), error: null };
  },
  from: () => {
    const query = {};
    query.select = () => query;
    query.eq = (column, value) => {
      if (column === 'id') query.id = value;
      return query;
    };
    query.maybeSingle = async () => ({ data: instructionById[query.id] || null, error: null });
    return query;
  },
};

function stubModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

stubModule('../src/supabase/client', supabaseStub);
stubModule('../src/services/voyageEmbeddings', {
  embedQuery: async (text) => text,
  embedQueries: async (texts) => texts.map((text) => [text.length, 1]),
});

const { getRelevantInstructions, isLexicalFollowUp } = require('../src/services/agentInstructions');

function row(id, entity, similarity) {
  return {
    id,
    case_group: 'Educación',
    case_subgroup: `${entity} - teléfono, contacto (colegio; teléfono de ${entity}, número de ${entity})`,
    instruction: `El teléfono de ${entity} es el 968 000 000.`,
    response_mode: 'directo',
    similarity,
  };
}

const CEIP = row('ceip-id', 'CEIP Monte Anaor', 0.9);
const IES = row('ies-id', 'IES Villa de Alguazas', 0.6);
const BIBLIOTECA = {
  ...row('biblio-id', 'Biblioteca Municipal', 0.85),
  case_group: 'Cultura y Turismo',
};

const CEIP_STATE = {
  source_kind: 'instruction',
  source_id: CEIP.id,
  entity_label: 'CEIP Monte Anaor',
  context_text: `${CEIP.case_group} › ${CEIP.case_subgroup}`,
  intent: 'contacto',
  pending_options: [],
};

const HISTORY = [
  { role: 'user', content: 'información del CEIP Monte Anaor' },
  { role: 'assistant', content: 'El teléfono de CEIP Monte Anaor es el 968 000 000.' },
];

// Búsqueda por texto: lo que nombra la entidad devuelve su ficha primero; un
// "teléfono" suelto devuelve fichas CONTACTO de cualquier entidad (el ruido que
// provocaba el fallo original).
function setRpcByText() {
  rpcRows = (text) => {
    if (text.includes('Monte Anaor')) return [CEIP, IES];
    if (text.toLowerCase().includes('biblioteca')) return [BIBLIOTECA, IES];
    return [IES, BIBLIOTECA, CEIP].map((r, i) => ({ ...r, similarity: 0.55 - i * 0.01 }));
  };
}

async function retrieve(message, state, history = HISTORY) {
  rpcCalls.length = 0;
  setRpcByText();
  const retrievalMeta = {};
  const directMatches = rpcRows(message).filter((r) => r.similarity >= 0.4);
  const instructions = await getRelevantInstructions(
    'agent-1',
    message,
    history,
    { directMatches, retrievalMeta, conversationState: state }
  );
  return { instructions, retrievalMeta };
}

test('"y su número de teléfono" recupera la ficha del tema activo', async () => {
  const { instructions, retrievalMeta } = await retrieve('y su número de teléfono', CEIP_STATE);

  assert.equal(instructions[0].id, CEIP.id);
  assert.equal(retrievalMeta.stateFollowUp, true);
  assert.equal(retrievalMeta.stateFollowUpDetected, true);
  assert.equal(retrievalMeta.contextFollowUp, true);
  assert.equal(retrievalMeta.clarificationFollowUp, false);
  assert.ok(
    rpcCalls.some((q) => q.startsWith(CEIP_STATE.context_text) && q.endsWith('y su número de teléfono')),
    'la búsqueda debe llevar el contexto guardado + el mensaje'
  );
});

test('seguimiento sin "y" ni prefijo conocido ("dame su teléfono")', async () => {
  const { instructions, retrievalMeta } = await retrieve('dame su teléfono', CEIP_STATE);
  assert.equal(instructions[0].id, CEIP.id);
  assert.equal(retrievalMeta.stateFollowUp, true);
});

test('un tema nuevo no usa el contexto guardado', async () => {
  const { instructions, retrievalMeta } = await retrieve('teléfono de la biblioteca', CEIP_STATE);

  assert.equal(instructions[0].id, BIBLIOTECA.id);
  assert.equal(retrievalMeta.stateFollowUp, false);
  assert.ok(!rpcCalls.some((q) => q.includes(CEIP_STATE.context_text)));
});

test('sin estado vigente no se aplica el contexto guardado', async () => {
  const { retrievalMeta } = await retrieve('su teléfono', null);
  assert.equal(retrievalMeta.stateFollowUp, false);
  assert.equal(retrievalMeta.stateFollowUpDetected, false);
});

test('tras una aclaración (solo opciones, sin ficha) no se arrastra el tema viejo', async () => {
  const afterClarification = {
    source_kind: null,
    source_id: null,
    entity_label: null,
    context_text: null,
    intent: null,
    pending_options: [{ source_kind: 'instruction', source_id: IES.id, label: 'Educación: IES' }],
  };
  const history = [
    { role: 'user', content: 'colegios' },
    { role: 'assistant', content: '¿Te refieres a Educación: IES o a Educación: CEIP?' },
  ];
  const { retrievalMeta } = await retrieve('y su teléfono', afterClarification, history);
  assert.equal(retrievalMeta.stateFollowUp, false);
  assert.ok(!rpcCalls.some((q) => q.includes('Monte Anaor')));
});

test('"el segundo" se resuelve por id desde las opciones pendientes', async () => {
  instructionById = { [BIBLIOTECA.id]: { ...BIBLIOTECA } };
  const pending = {
    ...CEIP_STATE,
    pending_options: [
      { source_kind: 'instruction', source_id: IES.id, label: 'A' },
      { source_kind: 'instruction', source_id: BIBLIOTECA.id, label: 'B' },
    ],
  };
  const { instructions, retrievalMeta } = await retrieve('el segundo', pending);

  assert.equal(instructions.length, 1);
  assert.equal(instructions[0].id, BIBLIOTECA.id);
  assert.equal(retrievalMeta.clarificationFollowUp, true);
  assert.equal(retrievalMeta.stateFollowUp, true);
});

test('seguimiento detectado sin fichas en la búsqueda: queda marcado para conservar el estado', async () => {
  rpcCalls.length = 0;
  rpcRows = () => [];
  const retrievalMeta = {};
  const instructions = await getRelevantInstructions(
    'agent-1',
    'y su teléfono',
    HISTORY,
    { directMatches: [], retrievalMeta, conversationState: CEIP_STATE }
  );
  assert.equal(retrievalMeta.stateFollowUpDetected, true);
  assert.equal(retrievalMeta.stateFollowUp, false);
  assert.deepEqual(instructions, []);
});

test('isLexicalFollowUp: un arranque elíptico que nombra algo nuevo no es seguimiento', () => {
  const context = 'información del CEIP Monte Anaor El teléfono de CEIP Monte Anaor es el 968 000 000.';

  // Nombra una entidad nueva → tema nuevo (antes se mezclaba con el colegio).
  assert.equal(isLexicalFollowUp('teléfono de la biblioteca', context), false);
  assert.equal(isLexicalFollowUp('la biblioteca', context), false);

  // Sin palabras nuevas → sigue siendo seguimiento.
  assert.equal(isLexicalFollowUp('el teléfono', context), true);
  assert.equal(isLexicalFollowUp('el segundo', context), true);
  assert.equal(isLexicalFollowUp('la dirección', context), true);

  // Cue explícito: no se veta (decide la comparación de similitud).
  assert.equal(isLexicalFollowUp('y la biblioteca?', context), true);
  assert.equal(isLexicalFollowUp('y si soy menor de edad?', context), true);

  // Sin contexto se mantiene el comportamiento anterior.
  assert.equal(isLexicalFollowUp('teléfono de la biblioteca'), true);
});
