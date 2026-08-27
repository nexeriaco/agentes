const anthropic = require('../anthropic/client');
const { getAgentInstructions } = require('./agentInstructions');

const MODEL = 'claude-haiku-4-5';

// Punto de baja confianza: si Claude no encuentra un caso claro, responde
// exactamente este texto en vez de inventar una respuesta.
// TODO: cuando exista un canal de derivación a humano (ej. notificar a un
// operador o crear un ticket), conectarlo en los dos puntos marcados abajo
// en vez de solo devolver needsHuman: true.
const HUMAN_HANDOFF_SENTINEL = 'DERIVAR_A_HUMANO';

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

function buildSystemPrompt(instructions) {
  return `Eres el asistente virtual de un ayuntamiento. A continuación tienes una lista de casos con instrucciones específicas sobre cómo debes atender las consultas de los ciudadanos.

${buildInstructionsBlock(instructions)}

Tu tarea:
1. Identifica cuál de los casos anteriores aplica a la consulta del ciudadano.
2. Responde siguiendo esa instrucción, citando explícitamente el caso que aplicaste (por ejemplo: "Según el caso 'Padrón': ...").
3. Si ninguno de los casos aplica con claridad a la consulta, no respondas por tu cuenta: responde únicamente con el texto ${HUMAN_HANDOFF_SENTINEL}, sin nada más.`;
}

// Recibe el mensaje de un ciudadano y el agentId ya resuelto por el
// enrutamiento, y genera la respuesta usando las instrucciones de ese
// agente como contexto. Devuelve { needsHuman: true, answer: null } cuando
// no hay instrucciones aplicables, en vez de responder a ciegas.
async function generateAnswer(citizenMessage, agentId) {
  const instructions = await getAgentInstructions(agentId);

  if (instructions.length === 0) {
    // TODO: derivar a un humano.
    return { needsHuman: true, answer: null };
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(instructions),
    messages: [{ role: 'user', content: citizenMessage }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  const text = textBlock ? textBlock.text.trim() : '';

  if (text === HUMAN_HANDOFF_SENTINEL) {
    // TODO: derivar a un humano.
    return { needsHuman: true, answer: null };
  }

  return { needsHuman: false, answer: text };
}

module.exports = { generateAnswer };
