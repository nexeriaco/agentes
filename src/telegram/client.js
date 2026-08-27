const TELEGRAM_API_BASE = 'https://api.telegram.org';

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('Falta la variable de entorno TELEGRAM_BOT_TOKEN');
}

// El token tiene el formato "<bot_id>:<hash>"; el bot_id es el
// identificador técnico que usamos como identifier del canal en Supabase.
function getBotId() {
  return process.env.TELEGRAM_BOT_TOKEN.split(':')[0];
}

async function callApi(method, params) {
  const url = `${TELEGRAM_API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API error (${method}): ${data.description}`);
  }

  return data.result;
}

function sendMessage(chatId, text) {
  return callApi('sendMessage', { chat_id: chatId, text });
}

// Long polling requiere que no haya un webhook activo en el bot.
function deleteWebhook() {
  return callApi('deleteWebhook', {});
}

// timeout activa long polling: la llamada espera hasta ese tiempo (en
// segundos) a que haya updates antes de responder vacío.
function getUpdates(offset, timeout = 30) {
  return callApi('getUpdates', { offset, timeout });
}

module.exports = { getBotId, sendMessage, deleteWebhook, getUpdates };
