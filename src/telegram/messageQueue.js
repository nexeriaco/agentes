const { handleIncomingMessage } = require('./messageHandler');

const MAX_CONCURRENT = 10;
const UPDATE_DEDUPE_TTL_MS = 10 * 60 * 1000;

let inFlight = 0;
const waiters = [];
const chatQueues = new Map();
const seenUpdateIds = new Map();

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

function pruneSeenUpdates(now) {
  for (const [updateId, expiresAt] of seenUpdateIds) {
    if (expiresAt <= now) seenUpdateIds.delete(updateId);
  }
}

function markUpdateIfNew(updateId) {
  if (updateId == null) return true;

  const now = Date.now();
  pruneSeenUpdates(now);
  const key = String(updateId);
  if (seenUpdateIds.has(key)) return false;

  seenUpdateIds.set(key, now + UPDATE_DEDUPE_TTL_MS);
  return true;
}

function enqueueMessage(chatId, text, updateId = null) {
  if (!markUpdateIfNew(updateId)) return false;

  const key = String(chatId);
  const previous = chatQueues.get(key) || Promise.resolve();
  const next = previous
    .then(async () => {
      await acquireSlot();
      try {
        await handleIncomingMessage(chatId, text);
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
  return true;
}

module.exports = { enqueueMessage, MAX_CONCURRENT };
