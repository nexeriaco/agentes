const anthropic = require('../anthropic/client');
const { getRelevantInstructions, matchInstructions } = require('./agentInstructions');
const { getAgent } = require('./agents');
const { getRelevantEvents } = require('./agentEvents');
const { BUSCAR_URL_TOOL } = require('../anthropic/tools');
const { buscarUrlConCache } = require('./urlCache');
const { buildReadableUrlPolicy, isUrlAllowedByPolicy } = require('./urlGuard');
const { getRecentHistory } = require('./conversationHistory');
const { isPoliteClosingMessage, POLITE_CLOSING_ANSWER } = require('./politeClosing');
const {
  emptyUsage,
  summarizeInstruction,
  summarizeCandidates,
  logConsulta,
} = require('./consultaLog');
const {
  HUMAN_HANDOFF_SENTINEL,
  buildFixedSystemPrompt,
  buildInstructionsPrompt,
} = require('./promptBuilder');

const MODEL = 'claude-haiku-4-5';

// Margen de llamadas a la herramienta buscar_url antes de forzar una
// respuesta final (evita bucles: página general + PDF concreto son 2 en el
// camino feliz, se deja margen para reintentos).
const MAX_TOOL_CALLS = 4;

// Similitud mínima para el atajo 'directo' cuando hay VARIAS candidatas.
// Más exigente que SIMILARITY_THRESHOLD (0.4) porque Claude no revisa
// después. Excepción: si solo hay 1 candidata y es 'directo', basta el 0.4
// (ya filtrado en matchInstructions) — no hay ambigüedad.
const DIRECT_RESPONSE_THRESHOLD = 0.55;

// Cuántas candidatas (ya ordenadas por similitud) se miran para un atajo
// 'directo'. Así una ficha FAQ correcta en 2.º/3.º no pierde el atajo solo
// porque otra NORMA irrelevante empató por milésimas en el 1.º.
const DIRECT_RESPONSE_TOP_K = 3;

// Holgura máxima respecto a la nº 1: sim_top1 - sim_directo. Si el mejor
// 'directo' del top-K queda mucho por debajo del líder, no se fuerza el
// atajo (el líder puede ser la respuesta correcta vía IA). ~0.02 cubre
// empates tipo Emprendedor vs ruido; no deja pasar un directo flojo (0.56)
// detrás de un top claro (0.70).
const DIRECT_RESPONSE_MAX_GAP_FROM_TOP = 0.02;

// Sin fichas/eventos por encima del umbral: pedir reformular (0 tokens).
// No es handoff a teléfono — suele ser consulta demasiado corta o ambigua
// (p. ej. "farola fundida" bajo SIMILARITY_THRESHOLD).
const REFORMULATE_ANSWER =
  'No he encontrado información clara con esa consulta. ¿Puedes reformularla con un poco más de detalle? Por ejemplo: qué necesitas, el trámite o el lugar.';

// Precio Claude Haiku 4.5 (USD / millón de tokens). Caché = ephemeral 5 min.
const HAIKU_USD_PER_MTOK = {
  input: 1.0,
  output: 5.0,
  cache_write_5m: 1.25,
  cache_read: 0.1,
};

// Línea final que Claude añade para trazar la fila usada; se elimina antes
// de enviar al ciudadano. Formatos: FUENTE:uuid | FUENTE:evento:id | FUENTE:ninguna
const FUENTE_LINE_RE = /\n*FUENTE:(.+)\s*$/i;

function addUsage(totals, usage) {
  if (!usage) return totals;
  totals.input_tokens += usage.input_tokens || 0;
  totals.output_tokens += usage.output_tokens || 0;
  totals.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
  totals.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
  return totals;
}

function calculateHaikuCostUsd(usage) {
  const cost =
    ((usage.input_tokens || 0) * HAIKU_USD_PER_MTOK.input
      + (usage.cache_creation_input_tokens || 0) * HAIKU_USD_PER_MTOK.cache_write_5m
      + (usage.cache_read_input_tokens || 0) * HAIKU_USD_PER_MTOK.cache_read
      + (usage.output_tokens || 0) * HAIKU_USD_PER_MTOK.output)
    / 1_000_000;
  return Number(cost.toFixed(6));
}

function extractFuente(rawText, instructions, events) {
  const match = rawText.match(FUENTE_LINE_RE);
  if (!match) {
    return { answer: rawText.trim(), fuente: null, fuente_raw: null };
  }

  const answer = rawText.slice(0, match.index).trim();
  const raw = match[1].trim();
  const lower = raw.toLowerCase();

  if (lower === 'ninguna') {
    return { answer, fuente: null, fuente_raw: raw };
  }

  if (lower.startsWith('evento:')) {
    const eventId = raw.slice('evento:'.length).trim();
    const event = events.find((ev) => String(ev.id) === eventId);
    return {
      answer,
      fuente: event
        ? { tabla: 'agent_events', id: event.id, title: event.title }
        : { tabla: 'agent_events', id: eventId, title: null },
      fuente_raw: raw,
    };
  }

  const instr = instructions.find((row) => String(row.id) === raw);
  return {
    answer,
    fuente: instr ? summarizeInstruction(instr) : { tabla: 'agent_instructions', id: raw },
    fuente_raw: raw,
  };
}

// Recibe el mensaje de un ciudadano, el agentId ya resuelto por el
// enrutamiento y el chatId de la conversación (para recuperar su
// historial reciente), y genera la respuesta usando las instrucciones
// generales, los eventos vigentes/próximos 90 días (con su estado ya
// calculado) y la configuración (tono, contacto de escalación) de ese
// agente como contexto. Devuelve { needsHuman: true, answer: null } cuando
// el agente no existe. Si el agente existe pero no hay instrucciones ni
// eventos aplicables, pide reformular (sin derivar a teléfono).
async function generateAnswer(citizenMessage, agentId, chatId) {
  if (isPoliteClosingMessage(citizenMessage)) {
    logConsulta({
      fecha: new Date().toISOString(),
      modo: 'cierre',
      consulta: citizenMessage,
      respuesta: POLITE_CLOSING_ANSWER,
      fuente: null,
      candidatas: [],
      tokens: emptyUsage(),
      coste_usd: 0,
      modelo: null,
    });
    return { needsHuman: false, answer: POLITE_CLOSING_ANSWER };
  }

  const today = new Date().toISOString().slice(0, 10);

  const [agent, events, history, directMatches] = await Promise.all([
    getAgent(agentId),
    getRelevantEvents(agentId, today),
    getRecentHistory(agentId, chatId),
    matchInstructions(agentId, citizenMessage),
  ]);
  const instructions = await getRelevantInstructions(
    agentId,
    citizenMessage,
    history,
    { directMatches }
  );

  if (!agent) {
    logConsulta({
      fecha: new Date().toISOString(),
      modo: 'handoff',
      consulta: citizenMessage,
      respuesta: null,
      fuente: null,
      candidatas: summarizeCandidates(instructions),
      tokens: emptyUsage(),
      coste_usd: 0,
      modelo: null,
      motivo: 'agente_inactivo_o_inexistente',
    });
    return { needsHuman: true, answer: null, escalationContact: null };
  }

  if (instructions.length === 0 && events.length === 0) {
    logConsulta({
      fecha: new Date().toISOString(),
      modo: 'reformular',
      consulta: citizenMessage,
      respuesta: REFORMULATE_ANSWER,
      fuente: null,
      candidatas: [],
      tokens: emptyUsage(),
      coste_usd: 0,
      modelo: null,
      motivo: 'sin_instrucciones_ni_eventos',
    });
    return { needsHuman: false, answer: REFORMULATE_ANSWER };
  }

  // Atajo 'directo':
  // a) Única candidata (ya ≥ SIMILARITY_THRESHOLD 0.4) y es 'directo' →
  //    devolverla sin Claude: no hay ambigüedad que resolver.
  // b) Varias candidatas: mejor 'directo' del top-K si supera
  //    DIRECT_RESPONSE_THRESHOLD (0.55) y no queda lejos de la nº 1
  //    (evita Claude en FAQs claras aunque otra fila irrelevante gane por
  //    milésimas; no fuerza un directo flojo si el top es claramente otra).
  const topInstruction = instructions[0];
  const topSim = topInstruction ? topInstruction.similarity : 0;
  const soleDirecto = instructions.length === 1
    && topInstruction.response_mode === 'directo'
    ? topInstruction
    : null;
  const bestDirecto = soleDirecto || instructions
    .slice(0, DIRECT_RESPONSE_TOP_K)
    .filter((instr) => instr.response_mode === 'directo'
      && instr.similarity >= DIRECT_RESPONSE_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)[0];
  const closeEnoughToTop = soleDirecto
    || (bestDirecto
      && (topSim - bestDirecto.similarity) <= DIRECT_RESPONSE_MAX_GAP_FROM_TOP);

  if (bestDirecto && closeEnoughToTop) {
    logConsulta({
      fecha: new Date().toISOString(),
      modo: 'directo',
      consulta: citizenMessage,
      respuesta: bestDirecto.instruction,
      fuente: summarizeInstruction(bestDirecto),
      candidatas: summarizeCandidates(instructions),
      tokens: emptyUsage(),
      coste_usd: 0,
      modelo: null,
    });
    return { needsHuman: false, answer: bestDirecto.instruction };
  }

  // Bloque fijo (tono, reglas, estilo, tarea, eventos del día) con
  // cache_control: idéntico entre mensajes de una misma conversación, así
  // que a partir del segundo mensaje se lee de caché en vez de reescribirse.
  // Bloque dinámico (casos seleccionados para esta pregunta) sin
  // cache_control, después del breakpoint: cambia cada mensaje pero no
  // invalida la caché del bloque fijo que lo precede.
  const system = [
    {
      type: 'text',
      text: buildFixedSystemPrompt(agent, events, today),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: buildInstructionsPrompt(instructions),
    },
  ];
  const urlPolicy = buildReadableUrlPolicy(instructions, events);
  const hasReadableUrls = urlPolicy.exactUrls.size > 0;

  const messages = [...history, { role: 'user', content: citizenMessage }];
  let toolCallCount = 0;
  const urlReads = [];
  let text = '';
  const usageTotals = emptyUsage();

  // Bucle de tool use: mientras Claude pida buscar_url (hasta MAX_TOOL_CALLS
  // veces) se ejecuta de verdad y su resultado se devuelve como tool_result.
  // Al agotar el margen se deja de ofrecer la tool, lo que fuerza una
  // respuesta final en texto y garantiza que el bucle termina.
  while (true) {
    const offerTool = hasReadableUrls && toolCallCount < MAX_TOOL_CALLS;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      system,
      messages,
      ...(offerTool ? { tools: [BUSCAR_URL_TOOL] } : {}),
    });

    addUsage(usageTotals, response.usage);
    messages.push({ role: 'assistant', content: response.content });

    const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
    if (!offerTool || toolUseBlocks.length === 0) {
      const textBlock = response.content.find((block) => block.type === 'text');
      text = textBlock ? textBlock.text.trim() : '';
      break;
    }

    const toolResults = [];
    for (const block of toolUseBlocks) {
      toolCallCount += 1;
      const requestedUrl = block.input && block.input.url;
      let result;
      if (!isUrlAllowedByPolicy(requestedUrl, urlPolicy)) {
        result = {
          kind: 'error',
          content: [{
            type: 'text',
            text: `URL no permitida: solo se pueden abrir URLs asociadas a un caso o evento de este turno (o un documento del mismo sitio).`,
          }],
        };
      } else {
        result = await buscarUrlConCache(agentId, requestedUrl, citizenMessage, urlPolicy);
      }
      urlReads.push({ url: requestedUrl, kind: result.kind || 'link' });
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result.content });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  const { answer, fuente, fuente_raw } = extractFuente(text, instructions, events);
  const costeUsd = calculateHaikuCostUsd(usageTotals);

  // Handoff si la respuesta (o el texto crudo) es solo el sentinel, o si lo
  // incluye como marcador (p. ej. explicación + DERIVAR_A_HUMANO).
  const answerIsHandoff = answer === HUMAN_HANDOFF_SENTINEL
    || text === HUMAN_HANDOFF_SENTINEL
    || new RegExp(`(^|\\n)\\s*${HUMAN_HANDOFF_SENTINEL}\\s*($|\\n)`, 'i').test(answer)
    || new RegExp(`(^|\\n)\\s*${HUMAN_HANDOFF_SENTINEL}\\s*($|\\n)`, 'i').test(text);

  if (answerIsHandoff) {
    // TODO: derivar a un humano.
    logConsulta({
      fecha: new Date().toISOString(),
      modo: 'handoff',
      consulta: citizenMessage,
      respuesta: HUMAN_HANDOFF_SENTINEL,
      fuente,
      fuente_raw,
      url_reads: urlReads,
      candidatas: summarizeCandidates(instructions),
      tokens: usageTotals,
      coste_usd: costeUsd,
      modelo: MODEL,
      tool_calls: toolCallCount,
      motivo: 'sentinel_derivar_a_humano',
    });
    return { needsHuman: true, answer: null, escalationContact: agent.escalation_contact };
  }

  logConsulta({
    fecha: new Date().toISOString(),
    modo: 'ia',
    consulta: citizenMessage,
    respuesta: answer,
    fuente,
    fuente_raw,
    url_reads: urlReads,
    candidatas: summarizeCandidates(instructions),
    tokens: usageTotals,
    coste_usd: costeUsd,
    modelo: MODEL,
    tool_calls: toolCallCount,
  });

  return { needsHuman: false, answer };
}

module.exports = { generateAnswer };
