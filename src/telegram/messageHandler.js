const { getTelegramRouting } = require('../services/routing');
const { generateAnswer, logConsulta } = require('../services/answer');
const { appendTurn } = require('../services/conversationHistory');
const { checkChatRateLimit } = require('../services/chatRateLimit');
const telegram = require('./client');

// Se usa cuando no hay un escalation_contact configurado para el agente
// (p. ej. si no se pudo identificar la ruta/agente en absoluto).
const GENERIC_HANDOFF_MESSAGE =
  'Gracias por tu mensaje. Un miembro de nuestro equipo se pondrá en contacto contigo en breve.';

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

function buildHandoffMessage(escalationContact) {
  if (escalationContact) {
    return `Gracias por tu mensaje. Para resolver tu consulta, por favor llama al ${escalationContact}.`;
  }
  return GENERIC_HANDOFF_MESSAGE;
}

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
        await telegram.sendMessage(chatId, GENERIC_HANDOFF_MESSAGE);
        return;
      }

      logConsulta({
        fecha: new Date().toISOString(),
        modo: 'fijo',
        consulta: trimmed,
        respuesta: WELCOME_MESSAGE,
        fuente: null,
        candidatas: [],
        tokens: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
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

    const routing = await getTelegramRouting(telegram.getBotId());
    if (!routing) {
      console.error('No se encontró una ruta activa para este bot de Telegram');
      await telegram.sendMessage(chatId, GENERIC_HANDOFF_MESSAGE);
      return;
    }

    const { needsHuman, answer, escalationContact } = await generateAnswer(
      trimmed,
      routing.agentId,
      chatId
    );
    const finalText = needsHuman ? buildHandoffMessage(escalationContact) : answer;

    await telegram.sendMessage(chatId, finalText);

    // El guardado del historial no debe romper la respuesta ya enviada:
    // si Supabase falla aquí, se pierde memoria de este turno pero el
    // ciudadano ya recibió su respuesta con normalidad.
    await appendTurn(routing.agentId, chatId, trimmed, finalText).catch((err) =>
      console.error('Error guardando historial de conversación:', err)
    );
  } catch (err) {
    console.error('Error procesando mensaje de Telegram:', err);
    await telegram.sendMessage(chatId, GENERIC_HANDOFF_MESSAGE).catch(() => {});
  }
}

module.exports = { handleIncomingMessage, MAX_MESSAGE_CHARS };
