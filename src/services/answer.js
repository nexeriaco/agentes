const anthropic = require('../anthropic/client');
const { getRelevantInstructions } = require('./agentInstructions');
const { getAgent } = require('./agents');
const { getRelevantEvents } = require('./agentEvents');
const { BUSCAR_URL_TOOL } = require('../anthropic/tools');
const { buscarUrlConCache } = require('./urlCache');
const { getRecentHistory } = require('./conversationHistory');

const MODEL = 'claude-haiku-4-5';

// Margen de llamadas a la herramienta buscar_url antes de forzar una
// respuesta final (evita bucles: página general + PDF concreto son 2 en el
// camino feliz, se deja margen para reintentos).
const MAX_TOOL_CALLS = 4;

// Similitud mínima para responder sin pasar por Claude en absoluto (filas
// response_mode='directo', p. ej. Transparencia). Más exigente que
// SIMILARITY_THRESHOLD (0.4, en agentInstructions.js) porque aquí no hay
// ningún criterio de Claude revisando después: un falso positivo se envía
// tal cual, con seguridad total. Punto de partida a calibrar con datos
// reales, igual que se calibró el 0.4 general.
const DIRECT_RESPONSE_THRESHOLD = 0.55;

// Margen mínimo de separación (similitud coseno) que debe sacar la mejor
// candidata a la segunda para responder en 'directo' sin pasar por Claude.
// Si dos o más casos quedan casi empatados, es señal de ambigüedad real
// (típico de grupos de filas muy parecidas entre sí, como "teléfono de
// [departamento]" repetido por concejalía) y ganar por decimales no es
// garantía suficiente de haber acertado la fila correcta. Punto de partida
// a calibrar con datos reales, igual que SIMILARITY_THRESHOLD y
// DIRECT_RESPONSE_THRESHOLD.
const DIRECT_RESPONSE_MARGIN = 0.03;

// Punto de baja confianza: si Claude no encuentra un caso claro, responde
// exactamente este texto en vez de inventar una respuesta.
// TODO: cuando exista un canal de derivación a humano (ej. notificar a un
// operador o crear un ticket usando agent.escalation_contact), conectarlo
// en los dos puntos marcados abajo en vez de solo devolver needsHuman: true.
const HUMAN_HANDOFF_SENTINEL = 'DERIVAR_A_HUMANO';

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

function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

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

function summarizeInstruction(instr) {
  if (!instr) return null;
  return {
    tabla: 'agent_instructions',
    id: instr.id,
    case_group: instr.case_group,
    case_subgroup: instr.case_subgroup,
    response_mode: instr.response_mode || null,
    similarity: instr.similarity != null ? Number(instr.similarity.toFixed(4)) : null,
  };
}

function summarizeEvent(event) {
  if (!event) return null;
  return {
    tabla: 'agent_events',
    id: event.id,
    title: event.title,
  };
}

function summarizeCandidates(instructions) {
  return instructions.map(summarizeInstruction);
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
      fuente: event ? summarizeEvent(event) : { tabla: 'agent_events', id: eventId, title: null },
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

function formatFuenteLine(fuente) {
  if (!fuente) return 'ninguna';
  if (fuente.tabla === 'agent_events') {
    return `agent_events | ${fuente.title || '(sin título)'} | id=${fuente.id}`;
  }
  const sim = fuente.similarity != null ? ` | sim=${fuente.similarity}` : '';
  const mode = fuente.response_mode ? ` | mode=${fuente.response_mode}` : '';
  return `agent_instructions | ${fuente.case_group || '?'} › ${fuente.case_subgroup || '?'} | id=${fuente.id}${sim}${mode}`;
}

function formatCandidatasLines(candidatas) {
  if (!candidatas || candidatas.length === 0) return ['  (ninguna)'];
  return candidatas.map((c, i) => {
    const sim = c.similarity != null ? c.similarity.toFixed(4) : '—.———';
    return `  ${i + 1}. [${sim}] ${c.case_group || '?'} › ${c.case_subgroup || '?'} | id=${c.id}`;
  });
}

function oneLine(text) {
  if (text == null) return '(vacío)';
  return String(text).replace(/\s+/g, ' ').trim();
}

// Un solo console.log por consulta (bloque multilínea) para que en Railway
// no se mezclen campos de preguntas distintas al pretty-print de objetos.
function logConsulta(payload) {
  const bar = '='.repeat(72);
  const thin = '-'.repeat(72);
  const tokens = payload.tokens || emptyUsage();
  const lines = [
    bar,
    `[consulta]  modo=${payload.modo}  |  ${payload.fecha}`,
    thin,
    `Consulta:   ${oneLine(payload.consulta)}`,
    `Respuesta:  ${oneLine(payload.respuesta)}`,
    thin,
    `Fuente:     ${formatFuenteLine(payload.fuente)}`,
  ];

  if (payload.fuente_raw != null) {
    lines.push(`Fuente raw: ${payload.fuente_raw}`);
  }
  if (payload.motivo) {
    lines.push(`Motivo:     ${payload.motivo}`);
  }

  lines.push('Candidatas:');
  lines.push(...formatCandidatasLines(payload.candidatas));
  lines.push(thin);
  lines.push(
    `Tokens:     in=${tokens.input_tokens || 0}  out=${tokens.output_tokens || 0}`
      + `  cache_w=${tokens.cache_creation_input_tokens || 0}`
      + `  cache_r=${tokens.cache_read_input_tokens || 0}`
  );
  lines.push(
    `Coste:      $${payload.coste_usd ?? 0}`
      + `  |  modelo=${payload.modelo || '—'}`
      + (payload.tool_calls != null ? `  |  tools=${payload.tool_calls}` : '')
  );
  lines.push(bar);

  console.log(lines.join('\n'));
}

function formatDate(isoTimestamp) {
  return isoTimestamp ? isoTimestamp.slice(0, 10) : 'sin fecha';
}

// Calculamos nosotros el estado (no se lo pedimos a Claude): comparar
// fechas de forma fiable es aritmética simple para código, pero es una
// fuente de errores para un modelo pequeño razonando en texto libre.
function daysBetween(fromDate, toDate) {
  const ms = new Date(`${toDate}T00:00:00Z`) - new Date(`${fromDate}T00:00:00Z`);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function computeEventStatus(event, today) {
  const start = formatDate(event.start_date);
  const end = formatDate(event.end_date);

  if (end !== 'sin fecha' && end < today) {
    return `YA FINALIZÓ (hace ${daysBetween(end, today)} días, el ${end})`;
  }
  if (start !== 'sin fecha' && start > today) {
    return `FUTURO (empieza en ${daysBetween(today, start)} días, el ${start})`;
  }
  return 'EN CURSO';
}

function buildInstructionsBlock(instructions) {
  return instructions
    .map((instr) => {
      const urlLine = instr.associated_url
        ? `URL asociada: ${instr.associated_url} (${
            instr.allow_url_reading
              ? 'puedes leer su contenido'
              : 'solo puedes compartirla, no leer su contenido'
          })`
        : 'Sin URL asociada.';
      return `ID: ${instr.id}\nConcejalía: ${instr.case_group}\nSubtema: ${instr.case_subgroup}\nInstrucción: ${instr.instruction}\n${urlLine}`;
    })
    .join('\n\n');
}

const MAX_EVENT_DESCRIPTION_CHARS = 400;

function truncateDescription(text) {
  if (!text) return 'sin descripción';
  if (text.length <= MAX_EVENT_DESCRIPTION_CHARS) return text;
  return `${text.slice(0, MAX_EVENT_DESCRIPTION_CHARS)}…`;
}

function buildEventsBlock(events, today) {
  if (events.length === 0) return 'No hay eventos ni avisos registrados en la ventana actual.';

  return events
    .map((ev) => {
      const urlLine = ev.url
        ? `URL asociada: ${ev.url} (${
            ev.allow_url_reading
              ? 'puedes leer su contenido'
              : 'solo puedes compartirla, no leer su contenido'
          })`
        : 'Sin URL asociada.';
      return `ID: ${ev.id}\nEvento: ${ev.title}\nDescripción: ${truncateDescription(ev.description)}\nVigencia: del ${formatDate(
        ev.start_date
      )} al ${formatDate(ev.end_date)}\nESTADO (ya calculado, respecto a hoy): ${computeEventStatus(
        ev,
        today
      )}\nUbicación: ${ev.location || 'no especificada'}\n${urlLine}`;
    })
    .join('\n\n');
}

// Parte FIJA del system prompt (tono, reglas, eventos de la ventana, tools).
// Idéntica entre mensajes de la misma conversación el mismo día → cache_control.
// Los casos semánticos van en buildInstructionsPrompt (sin cache_control).
function buildFixedSystemPrompt(agent, events, today) {
  const tone = agent.tone_instructions
    ? agent.tone_instructions
    : '(sin instrucciones de tono adicionales)';

  const escalationBlock = agent.escalation_contact
    ? `<internal_only>
Contacto de escalación interno: ${agent.escalation_contact}.
Nunca lo menciones, sugieras ni escribas en la respuesta al ciudadano.
</internal_only>

`
    : '';

  return `<role>
Eres el asistente virtual de un ayuntamiento. Hoy es ${today}.
Respondes a ciudadanos por chat: cercano, breve y en texto plano.
</role>

<sources>
Fuentes válidas SOLO de este turno:
1. Casos generales del bloque <relevant_cases>.
2. Eventos de <events> cuyo título, descripción o ubicación mencionen explícitamente el mismo lugar, servicio o tema de la consulta.
3. Contenido devuelto por buscar_url en este turno, solo de URLs marcadas como "puedes leer su contenido".

No son fuente: memoria del modelo, conocimiento general, ni datos de turnos anteriores (aunque tú los hayas escrito).
Si un dato concreto (teléfono, email, dirección, cifra, horario, fecha, nombre de entidad) no aparece literalmente en una fuente válida de este turno, no lo escribas.
</sources>

<events>
Calendario municipal filtrado: solo eventos EN CURSO y FUTURO que empiezan en los próximos 90 días. Cada ítem trae ESTADO ya calculado (EN CURSO / FUTURO): úsalo tal cual, no lo recalcules.

${buildEventsBlock(events, today)}
</events>

<tools>
Herramienta buscar_url: solo sobre URLs asociadas a un caso o evento con "puedes leer su contenido". Si dice "solo puedes compartirla", menciona la URL y no la abras.
Si al leer una página aparece un PDF o documento concreto relacionado con la consulta, vuelve a llamar la tool con esa URL exacta (tal como aparece en el resultado; nunca inventada).
PDFs con texto → usa el texto. PDFs escaneados → analizarás imágenes de páginas; no digas al ciudadano que es un escaneo. Si no hay información útil, no inventes el contenido.
</tools>

<tone>
${tone}
</tone>

${escalationBlock}<rules>
1. Eventos independientes: un evento solo afecta a lo que nombra explícitamente. No relacionas eventos por fechas, municipio o proximidad temática.
2. Prioridad: si un evento EN CURSO nombra el mismo lugar/servicio y modifica una instrucción general, prioriza el evento y dilo con naturalidad.
3. Ambigüedad entre entidades distintas (varios colegios, centros, oficinas…): pregunta cuál, listando solo opciones que estén en las fuentes de este turno. Si son intercambiables para lo preguntado, responde con cualquiera.
4. Inferencias: no completes huecos. Si no puedes confirmar con una fuente de este turno, no supongas.
</rules>

<output>
- Texto plano: sin markdown, sin etiquetas del tipo "Caso aplicable:" / "Estado actual:".
- Una sola respuesta final al ciudadano: la información pedida, o una pregunta de aclaración, o exactamente ${HUMAN_HANDOFF_SENTINEL}.
- No muestres razonamiento, dudas ni autocorrecciones.
- Frases naturales de chat municipal; breve; sin coletillas genéricas ("no dudes en contactar", etc.).
- Datos concretos: cópialos tal cual de la fuente; no parafrasees teléfonos, emails, direcciones, cifras, horarios ni fechas.
- Tras la respuesta al ciudadano, en la ÚLTIMA línea y nada más en esa línea, escribe exactamente uno de estos formatos (el sistema la eliminará antes de enviarla):
  FUENTE:<ID del caso de agent_instructions>
  FUENTE:evento:<ID del evento>
  FUENTE:ninguna
  Usa el ID del caso o evento del que tomaste la información principal. Si respondiste solo pidiendo aclaración o con ${HUMAN_HANDOFF_SENTINEL}, usa FUENTE:ninguna.
</output>

<fallback>
Si ningún caso ni evento aplicable cubre la consulta con claridad, o falta un dato concreto que el ciudadano pide y no está en las fuentes de este turno, responde con exactamente:
${HUMAN_HANDOFF_SENTINEL}
FUENTE:ninguna
</fallback>

<examples>
Estos ejemplos enseñan FORMATO y decisión, no hechos de este ayuntamiento. No reutilices sus datos.

<example>
<user>¿Me pasas el teléfono?</user>
<assistant>Ese dato ahora mismo no lo tengo a mano. ¿Me dices de qué o de quién lo necesitas?
FUENTE:ninguna</assistant>
</example>

<example>
<user>Pregunta ambigua entre dos entidades distintas presentes en los casos</user>
<assistant>Hay más de una opción. ¿Te refieres a A o a B?
FUENTE:ninguna</assistant>
</example>

<example>
<user>Consulta sin caso ni evento aplicable</user>
<assistant>${HUMAN_HANDOFF_SENTINEL}
FUENTE:ninguna</assistant>
</example>

<example>
<user>Pregunta cubierta por un caso, con un dato literal en la instrucción</user>
<assistant>(frase natural que incluye ese dato tal cual, sin etiquetas ni markdown)
FUENTE:(id del caso usado)</assistant>
</example>
</examples>

<task>
1. Elige el caso aplicable (razonamiento interno; no lo etiquetes en la respuesta).
2. Filtra eventos según las reglas.
3. Si hace falta y está permitido, usa buscar_url.
4. Responde según <output>, o <fallback> si no hay base suficiente.
5. Cierra siempre con la línea FUENTE:... indicada en <output>.
</task>`;
}

// Parte DINÁMICA: casos semánticos de este mensaje (sin cache_control).
function buildInstructionsPrompt(instructions) {
  if (instructions.length === 0) {
    return `<relevant_cases>
Ninguno con similitud suficiente.
</relevant_cases>`;
  }
  return `<relevant_cases>
Casos generales más relevantes para esta consulta. Son fuente válida solo si aplican de verdad a lo preguntado:

${buildInstructionsBlock(instructions)}
</relevant_cases>`;
}

// Recibe el mensaje de un ciudadano, el agentId ya resuelto por el
// enrutamiento y el chatId de la conversación (para recuperar su
// historial reciente), y genera la respuesta usando las instrucciones
// generales, los eventos vigentes/próximos 90 días (con su estado ya
// calculado) y la configuración (tono, contacto de escalación) de ese
// agente como contexto. Devuelve { needsHuman: true, answer: null } cuando
// no hay instrucciones ni eventos aplicables o el agente no existe, en vez
// de responder a ciegas.
async function generateAnswer(citizenMessage, agentId, chatId) {
  const today = new Date().toISOString().slice(0, 10);

  const [agent, events, history] = await Promise.all([
    getAgent(agentId),
    getRelevantEvents(agentId, today),
    getRecentHistory(agentId, chatId),
  ]);
  const instructions = await getRelevantInstructions(agentId, citizenMessage, history);

  if (!agent || (instructions.length === 0 && events.length === 0)) {
    // TODO: derivar a un humano.
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
      motivo: !agent ? 'agente_inactivo_o_inexistente' : 'sin_instrucciones_ni_eventos',
    });
    return { needsHuman: true, answer: null, escalationContact: agent ? agent.escalation_contact : null };
  }

  // Filas response_mode='directo' (p. ej. Transparencia): nunca pasan por
  // Claude. La instrucción de la fila mejor puntuada (ya viene ordenada por
  // similitud desde match_agent_instructions) ES el texto literal a enviar,
  // no una instrucción para que Claude redacte. Si la similitud no llega al
  // umbral, no se deriva a humano aquí: se sigue el flujo normal más abajo
  // con "instructions" completo, tal como si fuera una fila IA (Claude
  // decide con todo el contexto en vez de mandar un enlace equivocado a
  // ciegas). Solo se deriva a humano sin pasar por Claude si, tras el
  // filtro de 0.4 general, no queda ninguna instrucción ni evento.
  const topInstruction = instructions[0];
  const secondInstruction = instructions[1];
  const hasEnoughMargin = !secondInstruction
    || (topInstruction.similarity - secondInstruction.similarity) >= DIRECT_RESPONSE_MARGIN;
  if (
    topInstruction
    && topInstruction.response_mode === 'directo'
    && topInstruction.similarity >= DIRECT_RESPONSE_THRESHOLD
    && hasEnoughMargin
  ) {
    logConsulta({
      fecha: new Date().toISOString(),
      modo: 'directo',
      consulta: citizenMessage,
      respuesta: topInstruction.instruction,
      fuente: summarizeInstruction(topInstruction),
      candidatas: summarizeCandidates(instructions),
      tokens: emptyUsage(),
      coste_usd: 0,
      modelo: null,
    });
    return { needsHuman: false, answer: topInstruction.instruction };
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
  const hasReadableUrls =
    instructions.some((instr) => instr.allow_url_reading) || events.some((ev) => ev.allow_url_reading);

  const messages = [...history, { role: 'user', content: citizenMessage }];
  let toolCallCount = 0;
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
      const result = await buscarUrlConCache(agentId, block.input.url);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result.content });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  const { answer, fuente, fuente_raw } = extractFuente(text, instructions, events);
  const costeUsd = calculateHaikuCostUsd(usageTotals);

  if (answer === HUMAN_HANDOFF_SENTINEL || text === HUMAN_HANDOFF_SENTINEL) {
    // TODO: derivar a un humano.
    logConsulta({
      fecha: new Date().toISOString(),
      modo: 'handoff',
      consulta: citizenMessage,
      respuesta: HUMAN_HANDOFF_SENTINEL,
      fuente,
      fuente_raw,
      candidatas: summarizeCandidates(instructions),
      tokens: usageTotals,
      coste_usd: costeUsd,
      modelo: MODEL,
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
    candidatas: summarizeCandidates(instructions),
    tokens: usageTotals,
    coste_usd: costeUsd,
    modelo: MODEL,
    tool_calls: toolCallCount,
  });

  return { needsHuman: false, answer };
}

module.exports = { generateAnswer, buildFixedSystemPrompt, buildInstructionsPrompt, logConsulta };
