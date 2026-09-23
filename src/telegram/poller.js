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
  // Cola por chat: el mismo chatId se procesa en serie; chats distintos
  // siguen en paralelo (hasta MAX_CONCURRENT).
  /** @type {Map<string, Promise<void>>} */
  const chatQueues = new Map();

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

  function enqueueForChat(chatId, work) {
    const key = String(chatId);
    const previous = chatQueues.get(key) || Promise.resolve();
    const next = previous
      .then(async () => {
        await acquireSlot();
        try {
          await work();
        } finally {
          releaseSlot();
        }
      })
      .catch((err) => {
        console.error('Error procesando update de Telegram:', err);
      })
      .finally(() => {
        if (chatQueues.get(key) === next) {
          chatQueues.delete(key);
        }
      });
    chatQueues.set(key, next);
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

        enqueueForChat(chatId, () => handleIncomingMessage(chatId, text));
      }
    } catch (err) {
      console.error('Error en el polling de Telegram:', err);
      await sleep(5000);
    }
  }
}

module.exports = { startPolling };
