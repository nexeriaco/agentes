const { getTelegramRouting } = require('../services/routing');
const { generateAnswer } = require('../services/answer');
const telegram = require('./client');

const HUMAN_HANDOFF_MESSAGE =
  'Gracias por tu mensaje. Un miembro de nuestro equipo se pondrá en contacto contigo en breve.';

async function handleIncomingMessage(chatId, text) {
  try {
    const routing = await getTelegramRouting(telegram.getBotId());
    if (!routing) {
      console.error('No se encontró una ruta activa para este bot de Telegram');
      await telegram.sendMessage(chatId, HUMAN_HANDOFF_MESSAGE);
      return;
    }

    const { needsHuman, answer } = await generateAnswer(text, routing.agentId);
    await telegram.sendMessage(chatId, needsHuman ? HUMAN_HANDOFF_MESSAGE : answer);
  } catch (err) {
    console.error('Error procesando mensaje de Telegram:', err);
    await telegram.sendMessage(chatId, HUMAN_HANDOFF_MESSAGE).catch(() => {});
  }
}

module.exports = { handleIncomingMessage };
