const telegram = require('./client');
const { handleIncomingMessage } = require('./messageHandler');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Long polling para desarrollo local: evita exponer el servidor con un
// túnel público. En producción (Railway) esto se sustituye por el webhook
// de Telegram, igual que WhatsApp.
async function startPolling() {
  await telegram.deleteWebhook();
  console.log('Telegram: polling activo (webhook eliminado)');

  let offset = 0;

  while (true) {
    try {
      const updates = await telegram.getUpdates(offset);

      for (const update of updates) {
        offset = update.update_id + 1;

        const message = update.message;
        if (message && message.text) {
          await handleIncomingMessage(message.chat.id, message.text);
        }
      }
    } catch (err) {
      console.error('Error en el polling de Telegram:', err);
      await sleep(5000);
    }
  }
}

module.exports = { startPolling };
