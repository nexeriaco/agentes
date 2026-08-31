const anthropic = require('../anthropic/client');
const { getAgentInstructions } = require('./agentInstructions');
const { getAgent } = require('./agents');
const { getRelevantEvents } = require('./agentEvents');

const MODEL = 'claude-haiku-4-5';

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
      return `Caso: ${instr.case_group}\nInstrucción: ${instr.instruction}\n${urlLine}`;
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

function buildSystemPrompt(instructions, agent, events, today) {
  const sections = [
    `Eres el asistente virtual de un ayuntamiento. Hoy es ${today}.`,
    `A continuación tienes una lista de casos con instrucciones generales sobre cómo debes atender las consultas de los ciudadanos.`,
    buildInstructionsBlock(instructions),
    `A continuación tienes eventos y avisos del calendario municipal (desde hace 60 días hasta cualquier fecha futura, sin límite). Cada evento ya trae su ESTADO calculado (EN CURSO / YA FINALIZÓ / FUTURO): confía en ese estado tal cual, no lo recalcules ni lo cuestiones. Pueden ser información puntual (una feria, una excursión) o excepciones a una instrucción general (un cierre, una avería, un cambio de horario):`,
    buildEventsBlock(events, today),
  ];

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

  sections.push(`Tu tarea:
1. Identifica cuál de los casos generales aplica a la consulta del ciudadano (para tu razonamiento interno, no lo escribas como etiqueta).
2. Considera únicamente los eventos que mencionen explícitamente, por nombre, el mismo lugar, servicio o tema de la consulta en su título, descripción o ubicación (ver la regla estricta anterior). Ignora cualquier otro evento, aunque esté EN CURSO: no lo menciones ni lo relaciones con la respuesta.
3. Usa el ESTADO ya calculado de cada evento relevante (EN CURSO / YA FINALIZÓ / FUTURO) tal cual te lo doy. Si el estado es YA FINALIZÓ, ese evento ya no tiene ningún efecto: aplica la instrucción general o el evento EN CURSO que corresponda como si la excepción ya finalizada nunca hubiera existido, sin matices ni dudas sobre si "podría seguir" vigente.
4. Si un evento EN CURSO que menciona explícitamente el mismo lugar/servicio contradice o modifica una instrucción general (un cierre puntual, una avería, un cambio de horario), da prioridad a ese evento sobre la instrucción general: menciona explícitamente la excepción y no respondas solo con la información general.
5. Responde con la información del caso y, si aplica, del evento relevante, reflejando su estado (ya finalizó / en curso / futuro) con una frase natural — sin etiquetas ni formato, según las reglas de ESTILO de arriba.
6. Si ninguno de los casos generales ni de los eventos aplica con claridad y certeza a la consulta, no infieras ni completes con suposiciones: responde únicamente con el texto ${HUMAN_HANDOFF_SENTINEL}, sin nada más.
7. Entrega solo la conclusión final ya resuelta, con seguridad y sin hedging. No incluyas en tu respuesta el proceso de razonamiento, dudas ni autocorrecciones ("pero tengo que corregir", "revisando de nuevo"): el ciudadano solo debe ver la respuesta final, clara y directa, en el estilo indicado.`);

  return sections.join('\n\n');
}

// Recibe el mensaje de un ciudadano y el agentId ya resuelto por el
// enrutamiento, y genera la respuesta usando las instrucciones generales,
// los eventos recientes/en curso/futuros (con su estado ya calculado) y la
// configuración (tono, contacto de escalación) de ese agente como
// contexto. Devuelve { needsHuman: true, answer: null } cuando no hay
// instrucciones ni eventos aplicables o el agente no existe, en vez de
// responder a ciegas.
async function generateAnswer(citizenMessage, agentId) {
  const today = new Date().toISOString().slice(0, 10);

  const [instructions, agent, events] = await Promise.all([
    getAgentInstructions(agentId),
    getAgent(agentId),
    getRelevantEvents(agentId, today),
  ]);

  if (!agent || (instructions.length === 0 && events.length === 0)) {
    // TODO: derivar a un humano.
    return { needsHuman: true, answer: null, escalationContact: agent ? agent.escalation_contact : null };
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(instructions, agent, events, today),
    messages: [{ role: 'user', content: citizenMessage }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  const text = textBlock ? textBlock.text.trim() : '';

  if (text === HUMAN_HANDOFF_SENTINEL) {
    // TODO: derivar a un humano.
    return { needsHuman: true, answer: null, escalationContact: agent.escalation_contact };
  }

  return { needsHuman: false, answer: text };
}

module.exports = { generateAnswer };
