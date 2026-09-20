const anthropic = require('../anthropic/client');
const { getRelevantInstructions } = require('./agentInstructions');
const { getAgent } = require('./agents');
const { getRelevantEvents } = require('./agentEvents');
const { BUSCAR_URL_TOOL } = require('../anthropic/tools');
const { buscarUrlConCache } = require('./urlCache');
const { buildReadableUrlPolicy, isUrlAllowedByPolicy } = require('./urlGuard');
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

// Teléfono general del Ayuntamiento en data/original (directorio / página
// principal). Se usa cuando un documento abierto no trae el dato pedido.
// Si el agente tiene escalation_contact, ese valor tiene prioridad.
const DEFAULT_AYUNTAMIENTO_PHONE = '968 620 022';

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

// Lecturas reales vía buscar_url: pdf | link | error; vacío → nada.
function formatUrlReadsLine(urlReads) {
  if (!urlReads || urlReads.length === 0) return 'nada';
  return urlReads.map((r) => `${r.kind || 'link'} | ${r.url}`).join('  ;  ');
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
    `Lectura:    ${formatUrlReadsLine(payload.url_reads)}`,
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

  const ayuntamientoPhone = (agent.escalation_contact || DEFAULT_AYUNTAMIENTO_PHONE).trim();

  // Prompt fijo acortado: una sola cascada de tools, reglas sin duplicar
  // task/examples, e historial aclarado (contexto sí, hechos nuevos no).
  return `<role>
Eres el asistente virtual de un ayuntamiento. Hoy es ${today}.
Chat municipal: cercano, breve, texto plano (sin markdown ni etiquetas tipo "Caso aplicable:"), sin coletillas ("no dudes en contactar", etc.). Una sola respuesta: dato pedido, aclaración, o exactamente ${HUMAN_HANDOFF_SENTINEL}. Sin razonamiento visible.
</role>

<tone>
${tone}
</tone>

<sources>
Fuentes de HECHOS solo de este turno:
1. Casos de <relevant_cases> que apliquen de verdad.
2. Eventos de <events> que nombren explícitamente el mismo lugar, servicio o tema.
3. Resultado de buscar_url en este turno (puede ser extracto filtrado): no inventes nada que no aparezca ahí.

El historial del chat sirve para entender seguimientos ("¿y el teléfono?", "el segundo"), no para inventar datos nuevos. Si un dato concreto (teléfono, email, dirección, cifra, horario, fecha, nombre) no está literal en una fuente de este turno, no lo escribas —salvo que el ciudadano pida repetir un dato que tú ya diste en este hilo y sigue en el historial.
No uses memoria del modelo ni conocimiento general como fuente.
</sources>

<events>
EN CURSO / FUTURO (próx. 90 días). ESTADO ya calculado: úsalo tal cual.

${buildEventsBlock(events, today)}
</events>

<tools>
buscar_url: solo URLs con "puedes leer su contenido". Si dice "solo puedes compartirla", menciona la URL y no la abras.
Cascada (no saltes):
1. Texto del caso/evento si ya cubre la pregunta.
2. Si falta info y la URL es legible → buscar_url en esa página/PDF.
3. Si en el resultado aparece un PDF/doc concreto relacionado → segunda llamada con esa URL exacta (nunca inventada).
4. Si aún no hay base → aplica <doc_miss> o <fallback> según el caso.
PDF con texto → usa el texto. PDF escaneado (imágenes) → léelo; no digas al ciudadano que es un escaneo.
No abras URL/PDF solo para un contacto (teléfono, email, dirección, horario) si ya hay un caso CONTACTO con ese dato.
</tools>

<doc_miss>
Tras abrir un documento/página de este turno:
A) El dato pedido NO aparece en el extracto → NO uses ${HUMAN_HANDOFF_SENTINEL}. Responde en una o dos frases naturales: que no has encontrado esa información en el documento consultado, y que puede llamar al Ayuntamiento al ${ayuntamientoPhone}. Cierra con FUENTE:ninguna (o el ID del caso del documento si lo usaste).
B) El texto remite a OTRO archivo/ordenanza/PDF (por nombre o URL) → dilo con claridad al ciudadano (nombre del documento y URL si aparece literal en la fuente). Si esa URL exacta está entre las legibles de este turno, ábrela con buscar_url. Si no puedes abrirla en este turno, indica el archivo/enlace y, si aún falta el dato, añade que puede llamar al ${ayuntamientoPhone}.
No inventes nombres ni URLs de documentos que no salgan en las fuentes de este turno.
</doc_miss>

<intent>
Prefijos de subtema:
- CONTACTO · → teléfono, email, dirección, horario, redes.
- TRÁMITE · → cómo hacer algo, cita, app, enlace, requisitos, reserva.
- NORMA · → ordenanza, reglamento, tasa, artículo, PDF normativo.

Antes de elegir caso: contacto → CONTACTO (no NORMA ni PDFs); trámite → TRÁMITE; tasa/norma legal → NORMA (lee doc solo si está permitido).
Si hay tipos distintos y la pregunta es ambigua ("basuras", "terraza", "perro"), pregunta: ¿contacto, trámite o norma? No mezcles tipos en una respuesta.
</intent>

<rules>
1. Un evento solo afecta a lo que nombra. No los relacionas por fechas o proximidad temática.
2. Evento EN CURSO que modifica el mismo lugar/servicio que un caso general → prioriza el evento y dilo con naturalidad.
3. Varias entidades distintas en fuentes → pregunta cuál (solo opciones presentes). Si son intercambiables para lo pedido, responde con cualquiera.
4. No completes huecos ni combines datos de dos casos (teléfonos, importes, reglas). Si chocan, aclara o pregunta.
5. Responde solo a lo preguntado: si piden el teléfono, da el teléfono (no vuelques dirección/horario del mismo caso).
6. Si la fuente indica un año/curso distinto al de "Hoy es ${today}", avisa en una frase. No inventes el año. En eventos EN CURSO/FUTURO no hace falta aviso solo por el ESTADO.
</rules>

<output>
- Copia literales (teléfonos, emails, direcciones, cifras, horarios, fechas) tal cual de la fuente.
- Última línea exactamente una de:
  FUENTE:<ID caso>
  FUENTE:evento:<ID evento>
  FUENTE:ninguna
  (aclaración o ${HUMAN_HANDOFF_SENTINEL} → FUENTE:ninguna)
</output>

<fallback>
Sin caso/evento aplicable en absoluto (no has llegado a abrir un documento útil):
${HUMAN_HANDOFF_SENTINEL}
FUENTE:ninguna
</fallback>

<examples>
Formato y decisión (no hechos reales; no reutilices datos).

<example>
<user>Pregunta ambigua entre dos entidades en los casos</user>
<assistant>Hay más de una opción. ¿Te refieres a A o a B?
FUENTE:ninguna</assistant>
</example>

<example>
<user>Pregunta vaga con candidatas CONTACTO y NORMA</user>
<assistant>¿Necesitas el teléfono de contacto o la normativa/tasas de ese tema?
FUENTE:ninguna</assistant>
</example>

<example>
<user>Consulta sin caso ni evento aplicable</user>
<assistant>${HUMAN_HANDOFF_SENTINEL}
FUENTE:ninguna</assistant>
</example>

<example>
<user>Dato literal en un caso que aplica</user>
<assistant>(frase natural con el dato tal cual)
FUENTE:(id del caso)</assistant>
</example>

<example>
<user>Abriste un PDF y el dato pedido no está en el extracto</user>
<assistant>He consultado el documento disponible, pero no aparece esa información. Puedes llamar al Ayuntamiento al ${ayuntamientoPhone}.
FUENTE:ninguna</assistant>
</example>

<example>
<user>El PDF remite a otra ordenanza o archivo por nombre o URL</user>
<assistant>En ese documento se remite a (nombre del otro archivo). Puedes consultarlo aquí: (URL exacta si aparece en la fuente).
FUENTE:(id del caso leído)</assistant>
</example>
</examples>

<task>
1. Intención y caso según <intent> (interno; no etiquetes en la respuesta).
2. Eventos según <rules>; cascada <tools>.
3. Si abriste un doc y falta el dato o remite a otro archivo → <doc_miss>. Si no hay caso/evento → <fallback>.
4. Respuesta <output>; avisa año si aplica (regla 6). Cierra siempre con FUENTE:...
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
Casos más relevantes; úsalos solo si aplican de verdad. Prefijos CONTACTO · / TRÁMITE · / NORMA · → <intent>.

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

module.exports = { generateAnswer, buildFixedSystemPrompt, buildInstructionsPrompt, logConsulta };
