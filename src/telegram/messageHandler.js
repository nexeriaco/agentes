const { getTelegramRouting } = require('../services/routing');
const { generateAnswer } = require('../services/answer');
const { appendTurn } = require('../services/conversationHistory');
const telegram = require('./client');

// Se usa cuando no hay un escalation_contact configurado para el agente
// (p. ej. si no se pudo identificar la ruta/agente en absoluto).
const GENERIC_HANDOFF_MESSAGE =
  'Gracias por tu mensaje. Un miembro de nuestro equipo se pondrá en contacto contigo en breve.';

const WELCOME_MESSAGE =
  '¡Hola! Soy el asistente virtual del ayuntamiento. Escribe tu consulta y te ayudo con la información que necesites.';

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
    const routing = await getTelegramRouting(telegram.getBotId());
    if (!routing) {
      console.error('No se encontró una ruta activa para este bot de Telegram');
      await telegram.sendMessage(chatId, GENERIC_HANDOFF_MESSAGE);
      return;
    }

    // Apertura del chat: mensaje inicial directo, sin coste de IA.
    if (isTelegramOpenChat(text)) {
      console.log('[consulta]', {
        fecha: new Date().toISOString(),
        modo: 'fijo',
        consulta: text,
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

    const { needsHuman, answer, escalationContact } = await generateAnswer(text, routing.agentId, chatId);
    const finalText = needsHuman ? buildHandoffMessage(escalationContact) : answer;

    await telegram.sendMessage(chatId, finalText);

    // El guardado del historial no debe romper la respuesta ya enviada:
    // si Supabase falla aquí, se pierde memoria de este turno pero el
    // ciudadano ya recibió su respuesta con normalidad.
    await appendTurn(routing.agentId, chatId, text, finalText).catch((err) =>
      console.error('Error guardando historial de conversación:', err)
    );
  } catch (err) {
    console.error('Error procesando mensaje de Telegram:', err);
    await telegram.sendMessage(chatId, GENERIC_HANDOFF_MESSAGE).catch(() => {});
  }
}

module.exports = { handleIncomingMessage };
