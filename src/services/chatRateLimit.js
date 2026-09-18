// Límite por chat en memoria del proceso (no compartido entre réplicas).
const WINDOW_MS = 5 * 60 * 1000;
const MAX_MESSAGES = 20;
const DUPLICATE_WINDOW_MS = 2000;

/** @type {Map<string, number[]>} */
const timestampsByChat = new Map();
/** @type {Map<string, { text: string, at: number }>} */
const lastMessageByChat = new Map();

function prune(chatKey, now) {
  const list = timestampsByChat.get(chatKey) || [];
  const kept = list.filter((t) => now - t < WINDOW_MS);
  timestampsByChat.set(chatKey, kept);
  return kept;
}

/**
 * @returns {{ allowed: boolean, reason?: 'rate_limit' | 'duplicate' }}
 */
function checkChatRateLimit(chatId, text) {
  const chatKey = String(chatId);
  const now = Date.now();
  const normalized = String(text || '').trim();

  const last = lastMessageByChat.get(chatKey);
  if (last && last.text === normalized && now - last.at < DUPLICATE_WINDOW_MS) {
    return { allowed: false, reason: 'duplicate' };
  }

  const kept = prune(chatKey, now);
  if (kept.length >= MAX_MESSAGES) {
    return { allowed: false, reason: 'rate_limit' };
  }

  kept.push(now);
  timestampsByChat.set(chatKey, kept);
  lastMessageByChat.set(chatKey, { text: normalized, at: now });
  return { allowed: true };
}

module.exports = {
  checkChatRateLimit,
  WINDOW_MS,
  MAX_MESSAGES,
  DUPLICATE_WINDOW_MS,
};
