const { getTelegramRouting } = require('../services/routing');
const { generateAnswer } = require('../services/answer');
const { logConsulta, emptyUsage } = require('../services/consultaLog');
const { isPoliteClosingMessage, POLITE_CLOSING_ANSWER } = require('../services/politeClosing');
const { appendTurn } = require('../services/conversationHistory');
const { checkChatRateLimit } = require('../services/chatRateLimit');
const { REFORMULATE_ANSWER } = require('../constants');
const telegram = require('./client');

const WELCOME_MESSAGE =
  '¡Hola! Soy el asistente virtual del ayuntamiento. Escribe tu consulta y te ayudo con la información que necesites.';

const MAX_MESSAGE_CHARS = 300;

const TOO_LONG_MESSAGE =
  'Tu mensaje es demasiado largo. Por favor, resume tu consulta en menos de 300 caracteres.';

const RATE_LIMIT_MESSAGE =
  'Has enviado demasiados mensajes en poco tiempo. Espera unos minutos e inténtalo de nuevo.';

// Al abrir el bot, Telegram envía solo "/start" (o "/start@nombre_bot").
// No es un comando que el ciudadano escriba: es el evento de apertura.
// Respondemos con el mensaje inicial fijo, sin Claude (0 tokens).
const TELEGRAM_OPEN_CHAT_RE = /^\/start(?:@\w+)?$/i;

function isTelegramOpenChat(text) {
  return TELEGRAM_OPEN_CHAT_RE.test((text || '').trim());
}

async function handleIncomingMessage(chatId, text) {
  try {
    const trimmed = (text || '').trim();

    // /start: sin rate limit ni tope de longitud (evento de apertura).
    if (isTelegramOpenChat(trimmed)) {
      const routing = await getTelegramRouting(telegram.getBotId());
      if (!routing) {
        console.error('No se encontró una ruta activa para este bot de Telegram');
        await telegram.sendMessage(chatId, REFORMULATE_ANSWER);
        return;
      }

      logConsulta({
        fecha: new Date().toISOString(),
        modo: 'fijo',
        consulta: trimmed,
        respuesta: WELCOME_MESSAGE,
        fuente: null,
        candidatas: [],
        tokens: emptyUsage(),
        coste_usd: 0,
        modelo: null,
        motivo: 'apertura_chat',
      });
      await telegram.sendMessage(chatId, WELCOME_MESSAGE);
      return;
    }

    if (trimmed.length > MAX_MESSAGE_CHARS) {
      await telegram.sendMessage(chatId, TOO_LONG_MESSAGE);
      return;
    }

    const rate = checkChatRateLimit(chatId, trimmed);
    if (!rate.allowed) {
      if (rate.reason === 'rate_limit') {
        await telegram.sendMessage(chatId, RATE_LIMIT_MESSAGE);
      }
      // duplicate: silencio (mismo texto al instante)
      return;
    }

    // Cierre educado: tras rate limit, antes de routing / Claude (0 Voyage).
    if (isPoliteClosingMessage(trimmed)) {
      logConsulta({
        fecha: new Date().toISOString(),
        modo: 'cierre',
        consulta: trimmed,
        respuesta: POLITE_CLOSING_ANSWER,
        fuente: null,
        candidatas: [],
        tokens: emptyUsage(),
        coste_usd: 0,
        modelo: null,
      });
      await telegram.sendMessage(chatId, POLITE_CLOSING_ANSWER);

      const routing = await getTelegramRouting(telegram.getBotId());
      if (routing) {
        await appendTurn(routing.agentId, chatId, trimmed, POLITE_CLOSING_ANSWER).catch((err) =>
          console.error('Error guardando historial de conversación:', err)
        );
      }
      return;
    }

    const routing = await getTelegramRouting(telegram.getBotId());
    if (!routing) {
      console.error('No se encontró una ruta activa para este bot de Telegram');
      await telegram.sendMessage(chatId, REFORMULATE_ANSWER);
      return;
    }

    const { answer } = await generateAnswer(
      trimmed,
      routing.agentId,
      chatId
    );
    const finalText = answer || REFORMULATE_ANSWER;

    await telegram.sendMessage(chatId, finalText);

    // El guardado del historial no debe romper la respuesta ya enviada:
    // si Supabase falla aquí, se pierde memoria de este turno pero el
    // ciudadano ya recibió su respuesta con normalidad.
    await appendTurn(routing.agentId, chatId, trimmed, finalText).catch((err) =>
      console.error('Error guardando historial de conversación:', err)
    );
  } catch (err) {
    console.error('Error procesando mensaje de Telegram:', err);
    await telegram.sendMessage(chatId, REFORMULATE_ANSWER).catch(() => {});
  }
}

module.exports = { handleIncomingMessage };
