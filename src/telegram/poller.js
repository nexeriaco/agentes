const telegram = require('./client');
const { handleIncomingMessage } = require('./messageHandler');

const MAX_CONCURRENT = 10;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Long polling para desarrollo local: evita exponer el servidor con un
// túnel público. En producción (Railway) esto se sustituye por el webhook
// de Telegram, igual que WhatsApp.
async function startPolling() {
  await telegram.deleteWebhook();
  console.log(`Telegram: polling activo (webhook eliminado), máx. ${MAX_CONCURRENT} en paralelo`);

  let offset = 0;
  let inFlight = 0;
  const waiters = [];

  function acquireSlot() {
    if (inFlight < MAX_CONCURRENT) {
      inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      waiters.push(() => {
        inFlight += 1;
        resolve();
      });
    });
  }

  function releaseSlot() {
    inFlight -= 1;
    const next = waiters.shift();
    if (next) next();
  }

  while (true) {
    try {
      const updates = await telegram.getUpdates(offset);

      for (const update of updates) {
        offset = update.update_id + 1;

        const message = update.message;
        if (!(message && message.text)) continue;

        const chatId = message.chat.id;
        const text = message.text;

        // No await en serie: hasta MAX_CONCURRENT handlers a la vez.
        acquireSlot()
          .then(() => handleIncomingMessage(chatId, text))
          .catch((err) => {
            console.error('Error procesando update de Telegram:', err);
          })
          .finally(() => {
            releaseSlot();
          });
      }
    } catch (err) {
      console.error('Error en el polling de Telegram:', err);
      await sleep(5000);
    }
  }
}

module.exports = { startPolling, MAX_CONCURRENT };
