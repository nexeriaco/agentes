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

// Punto de baja confianza: si Claude no encuentra un caso claro, responde
// exactamente este texto en vez de inventar una respuesta.
// TODO: cuando exista un canal de derivación a humano (ej. notificar a un
// operador o crear un ticket usando agent.escalation_contact), conectarlo
// en los dos puntos marcados abajo en vez de solo devolver needsHuman: true.
const HUMAN_HANDOFF_SENTINEL = 'DERIVAR_A_HUMANO';

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
      return `Concejalía: ${instr.case_group}\nSubtema: ${instr.case_subgroup}\nInstrucción: ${instr.instruction}\n${urlLine}`;
    })
    .join('\n\n');
}

function buildEventsBlock(events, today) {
  if (events.length === 0) return 'No hay eventos ni avisos registrados.';

  return events
    .map((ev) => {
      const urlLine = ev.url
        ? `URL asociada: ${ev.url} (${
            ev.allow_url_reading
              ? 'puedes leer su contenido'
              : 'solo puedes compartirla, no leer su contenido'
          })`
        : 'Sin URL asociada.';
      return `Evento: ${ev.title}\nDescripción: ${ev.description || 'sin descripción'}\nVigencia: del ${formatDate(
        ev.start_date
      )} al ${formatDate(ev.end_date)}\nESTADO (ya calculado, respecto a hoy): ${computeEventStatus(
        ev,
        today
      )}\nUbicación: ${ev.location || 'no especificada'}\n${urlLine}`;
    })
    .join('\n\n');
}

// Parte FIJA del system prompt: todo lo que no depende de la pregunta
// concreta del ciudadano (tono, reglas generales, estilo, tarea, eventos del
// día, explicación de la herramienta buscar_url). Es idéntica entre todos
// los mensajes de una misma conversación (cambia como mucho una vez al día,
// con `today`), así que es la que lleva el cache_control: así el segundo y
// tercer mensaje de una conversación pueden leerla de caché en vez de
// reescribirla. Los casos generales seleccionados por búsqueda semántica
// SÍ cambian con cada pregunta, por eso van aparte en buildInstructionsPrompt
// y se envían sin cache_control (ver generateAnswer).
function buildFixedSystemPrompt(agent, events, today) {
  const sections = [
    `Eres el asistente virtual de un ayuntamiento. Hoy es ${today}.`,
    `A continuación tienes eventos y avisos del calendario municipal (desde hace 60 días hasta cualquier fecha futura, sin límite). Cada evento ya trae su ESTADO calculado (EN CURSO / YA FINALIZÓ / FUTURO): confía en ese estado tal cual, no lo recalcules ni lo cuestiones. Pueden ser información puntual (una feria, una excursión) o excepciones a una instrucción general (un cierre, una avería, un cambio de horario):`,
    buildEventsBlock(events, today),
  ];

  sections.push(`Dispones de una herramienta llamada buscar_url para consultar en tiempo real páginas web y documentos PDF públicos. Solo puedes usarla sobre una URL asociada a un caso o evento marcado como "puedes leer su contenido" — para las marcadas como "solo puedes compartirla, no leer su contenido" nunca la uses, límitate a mencionar la URL tal cual. Cuando uses la herramienta sobre una página, revisa su contenido para ver si hay un documento (normalmente un PDF) relacionado específicamente con la consulta del ciudadano; si lo hay, vuelve a usar la herramienta sobre la URL exacta de ese documento (tal como aparece en el contenido que acabas de recibir, nunca inventada ni recordada de memoria) para leer su contenido antes de responder.

Si el documento es un PDF con texto extraíble, recibirás ese texto directamente. Si es un PDF escaneado sin texto extraíble (por ejemplo, un documento fotografiado o impreso a mano), en su lugar recibirás sus páginas como imágenes: analízalas visualmente igual que harías con cualquier otra imagen para extraer la información que necesites, sin tratarlo como un fallo ni mencionárselo al ciudadano. Si aun así no consigues obtener información útil de un documento, no inventes su contenido bajo ningún concepto.`);

  if (agent.tone_instructions) {
    sections.push(`Tono y estilo que debes usar en tus respuestas: ${agent.tone_instructions}`);
  }

  if (agent.escalation_contact) {
    sections.push(
      `Contacto interno de escalación: ${agent.escalation_contact}. Este dato es SOLO para uso interno del sistema. Bajo ninguna circunstancia lo escribas, menciones, sugieras ni incluyas en tu respuesta al ciudadano, ni siquiera como recomendación de "puedes llamar al...". No tiene ningún otro uso en esta tarea.`
    );
  }

  sections.push(`REGLA ESTRICTA sobre inferencias entre eventos: cada evento es independiente de los demás. NUNCA asumas que un evento afecta a un lugar, servicio o tema que no menciona explícitamente por su nombre en el título, la descripción o la ubicación. Dos eventos distintos NO están relacionados entre sí solo por coincidir en fechas o por ocurrir en el mismo municipio — solo lo están si el texto de alguno de ellos menciona expresamente al otro tema.

Ejemplo de lo que NUNCA debes hacer: si hay un evento sobre una avería o corte de agua/luz en una calle o barrio, y la consulta es sobre la piscina municipal (o cualquier otro servicio), y ese evento de avería NO menciona la piscina (ni ese servicio) en su título, descripción o ubicación, entonces NO digas que "podría estar afectando también" a la piscina, ni sugieras esa posibilidad de ninguna forma. Trata ambos eventos como completamente independientes.

Si la información disponible no permite confirmar ni descartar algo con certeza, dilo explícitamente ("no tengo información confirmada sobre eso") en vez de inferir, suponer o construir una conexión que no está en los datos.`);

  sections.push(`ESTILO de tu respuesta (muy importante, aplica siempre):
- Texto plano, sin ningún formato markdown: nada de asteriscos, negrita, cursiva, encabezados ni listas con guiones o números.
- No escribas etiquetas como "Caso aplicable:", "Estado actual:", "Información actual:" ni similares. Identificar el caso y el evento es solo para tu razonamiento interno; el ciudadano no debe ver esa etiqueta, solo la respuesta en sí.
- Escribe como una persona del ayuntamiento contestando un chat: cercana, natural, en frases corridas, no como un informe.
- Sé breve. Evita coletillas de cierre genéricas como "te recomendamos que consultes", "no dudes en contactar" o "cualquier duda que tengas" — si hace falta un siguiente paso, dilo de forma simple y concreta, sin relleno.`);

  sections.push(`EJEMPLOS de estilo (ilustrativos: sirven para que veas el tono y el formato esperado, no son casos reales de este ayuntamiento — nunca repitas su contenido literal en una respuesta real, solo imita el tono y la forma):

Ciudadano: "¿dónde puedo pagar la tasa de basuras?"
Respuesta correcta: Puedes pagarla online en la sede electrónica del ayuntamiento, o presencialmente en la oficina de recaudación llevando el número de recibo a mano.

Ciudadano: "¿está abierta la piscina municipal este fin de semana?"
Respuesta correcta: Ahora mismo está cerrada por una avería en el sistema de filtrado, se espera que reabra la semana que viene en cuanto quede reparada.

Ciudadano: "¿cuándo es el próximo pleno municipal?"
Respuesta correcta: El próximo pleno ordinario es el tercer jueves del mes, a las 19:00 en el salón de plenos.

Ciudadano: "el mercadillo semanal ¿sigue siendo los martes?"
Respuesta correcta: Sí, el mercadillo sigue siendo los martes por la mañana, en su ubicación de siempre junto al recinto ferial.

Ciudadano: "¿hay algún corte de agua previsto en mi calle esta semana?"
Respuesta correcta (con un evento EN CURSO que menciona esa calle): Sí, hay un corte de agua programado en esa calle por una avería que se está reparando; se espera que quede resuelto en los próximos días.

Ciudadano: "¿puedo montar una acampada con caravana en el parque municipal?"
Respuesta correcta (sin caso ni evento que lo respalde con certeza): ${HUMAN_HANDOFF_SENTINEL}

Fíjate en el estilo de las respuestas correctas: frases naturales y directas, sin etiquetas, sin markdown y sin coletillas de cierre genéricas — y en que la última, al no haber una base clara, no inventa nada.`);

  sections.push(`Tu tarea:
1. Identifica cuál de los casos generales indicados a continuación (en el siguiente bloque) aplica a la consulta del ciudadano (para tu razonamiento interno, no lo escribas como etiqueta).
2. Considera únicamente los eventos que mencionen explícitamente, por nombre, el mismo lugar, servicio o tema de la consulta en su título, descripción o ubicación (ver la regla estricta anterior). Ignora cualquier otro evento, aunque esté EN CURSO: no lo menciones ni lo relaciones con la respuesta.
3. Usa el ESTADO ya calculado de cada evento relevante (EN CURSO / YA FINALIZÓ / FUTURO) tal cual te lo doy. Si el estado es YA FINALIZÓ, ese evento ya no tiene ningún efecto: aplica la instrucción general o el evento EN CURSO que corresponda como si la excepción ya finalizada nunca hubiera existido, sin matices ni dudas sobre si "podría seguir" vigente.
4. Si un evento EN CURSO que menciona explícitamente el mismo lugar/servicio contradice o modifica una instrucción general (un cierre puntual, una avería, un cambio de horario), da prioridad a ese evento sobre la instrucción general: menciona explícitamente la excepción y no respondas solo con la información general.
5. Responde con la información del caso y, si aplica, del evento relevante, reflejando su estado (ya finalizó / en curso / futuro) con una frase natural — sin etiquetas ni formato, según las reglas de ESTILO de arriba.
6. Si ninguno de los casos generales ni de los eventos aplica con claridad y certeza a la consulta, no infieras ni completes con suposiciones: responde únicamente con el texto ${HUMAN_HANDOFF_SENTINEL}, sin nada más.
7. Entrega solo la conclusión final ya resuelta, con seguridad y sin hedging. No incluyas en tu respuesta el proceso de razonamiento, dudas ni autocorrecciones ("pero tengo que corregir", "revisando de nuevo"): el ciudadano solo debe ver la respuesta final, clara y directa, en el estilo indicado.`);

  return sections.join('\n\n');
}

// Parte DINÁMICA: los casos generales seleccionados por búsqueda semántica
// para la pregunta concreta de este mensaje. Cambia en cada mensaje, así que
// se envía como bloque de system aparte, SIN cache_control, después del
// bloque fijo (ver "Render order: tools -> system -> messages" — un bloque
// sin marcador situado después del breakpoint no invalida la caché del
// bloque fijo que lo precede).
function buildInstructionsPrompt(instructions) {
  if (instructions.length === 0) {
    return 'No se ha encontrado ningún caso general con relación suficiente con esta consulta concreta del ciudadano.';
  }
  return `Casos generales seleccionados como más relevantes para la consulta actual del ciudadano, con instrucciones sobre cómo atenderla:\n\n${buildInstructionsBlock(instructions)}`;
}

// Recibe el mensaje de un ciudadano, el agentId ya resuelto por el
// enrutamiento y el chatId de la conversación (para recuperar su
// historial reciente), y genera la respuesta usando las instrucciones
// generales, los eventos recientes/en curso/futuros (con su estado ya
// calculado) y la configuración (tono, contacto de escalación) de ese
// agente como contexto. Devuelve { needsHuman: true, answer: null } cuando
// no hay instrucciones ni eventos aplicables o el agente no existe, en vez
// de responder a ciegas.
async function generateAnswer(citizenMessage, agentId, chatId) {
  const today = new Date().toISOString().slice(0, 10);

  const [instructions, agent, events, history] = await Promise.all([
    getRelevantInstructions(agentId, citizenMessage),
    getAgent(agentId),
    getRelevantEvents(agentId, today),
    getRecentHistory(agentId, chatId),
  ]);

  if (!agent || (instructions.length === 0 && events.length === 0)) {
    // TODO: derivar a un humano.
    return { needsHuman: true, answer: null, escalationContact: agent ? agent.escalation_contact : null };
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

    console.log('[claude-usage]', {
      chatId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
    });

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

  if (text === HUMAN_HANDOFF_SENTINEL) {
    // TODO: derivar a un humano.
    return { needsHuman: true, answer: null, escalationContact: agent.escalation_contact };
  }

  return { needsHuman: false, answer: text };
}

module.exports = { generateAnswer, buildFixedSystemPrompt, buildInstructionsPrompt };
