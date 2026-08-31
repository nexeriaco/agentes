const { getTelegramRouting } = require('../services/routing');
const { generateAnswer } = require('../services/answer');
const telegram = require('./client');

// Se usa cuando no hay un escalation_contact configurado para el agente
// (p. ej. si no se pudo identificar la ruta/agente en absoluto).
const GENERIC_HANDOFF_MESSAGE =
  'Gracias por tu mensaje. Un miembro de nuestro equipo se pondrá en contacto contigo en breve.';

function buildHandoffMessage(escalationContact) {
  if (escalationContact) {
    return `Gracias por tu mensaje. Para resolver tu consulta, por favor llama al ${escalationContact}.`;
  }
  return GENERIC_HANDOFF_MESSAGE;
}

async function handleIncomingMessage(chatId, text) {
  try {
    const routing = await getTelegramRouting(telegram.getBotId());
    if (!routing) {
      console.error('No se encontró una ruta activa para este bot de Telegram');
      await telegram.sendMessage(chatId, GENERIC_HANDOFF_MESSAGE);
      return;
    }

    const { needsHuman, answer, escalationContact } = await generateAnswer(text, routing.agentId);
    await telegram.sendMessage(chatId, needsHuman ? buildHandoffMessage(escalationContact) : answer);
  } catch (err) {
    console.error('Error procesando mensaje de Telegram:', err);
    await telegram.sendMessage(chatId, GENERIC_HANDOFF_MESSAGE).catch(() => {});
  }
}

module.exports = { handleIncomingMessage };
