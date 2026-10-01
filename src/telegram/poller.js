const telegram = require('./client');
const { enqueueMessage, MAX_CONCURRENT } = require('./messageQueue');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Long polling de Telegram (desarrollo y producción).
async function startPolling() {
  await telegram.deleteWebhook();
  console.log(`Telegram: polling activo (webhook eliminado), máx. ${MAX_CONCURRENT} en paralelo`);

  let offset = 0;

  while (true) {
    try {
      const updates = await telegram.getUpdates(offset);

      for (const update of updates) {
        offset = update.update_id + 1;

        const message = update.message;
        if (!(message && message.text)) continue;

        const chatId = message.chat.id;
        const text = message.text;

        enqueueMessage(chatId, text, update.update_id);
      }
    } catch (err) {
      console.error('Error en el polling de Telegram:', err);
      await sleep(5000);
    }
  }
}

module.exports = { startPolling };
