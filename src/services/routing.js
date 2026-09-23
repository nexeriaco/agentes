const supabase = require('../supabase/client');

const ROUTING_CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { value: object, expiresAt: number }>} */
const routingCache = new Map();

// Dado un tipo de canal (whatsapp, telegram, web...) y su identificador
// técnico (phone_number_id, bot id, dominio...), resuelve el canal, el
// cliente (tenant) y el agente activos que deben atenderlo.
// Caso simple: un canal tiene una única ruta activa (routing_rule se
// ignora por ahora, se usará más adelante si un cliente tiene varios agentes).
// Devuelve null si el canal, la ruta o el agente no existen o no están activos.
async function getChannelRouting(channelType, identifier) {
  const cacheKey = `${String(channelType).toLowerCase()}:${identifier}`;
  const cached = routingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .select('id, client_id')
    .ilike('type', channelType)
    .eq('identifier', identifier)
    .eq('active', true)
    .maybeSingle();

  if (channelError) throw channelError;
  if (!channel) return null;

  const { data: route, error: routeError } = await supabase
    .from('routing')
    .select('agent_id')
    .eq('channel_id', channel.id)
    .eq('active', true)
    .maybeSingle();

  if (routeError) throw routeError;
  if (!route) return null;

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, name')
    .eq('id', route.agent_id)
    .eq('active', true)
    .maybeSingle();

  if (agentError) throw agentError;
  if (!agent) return null;

  const result = {
    clientId: channel.client_id,
    channelId: channel.id,
    agentId: agent.id,
    agentName: agent.name,
  };

  // Solo cachear aciertos: un null no debe bloquear un alta reciente de ruta.
  routingCache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + ROUTING_CACHE_TTL_MS,
  });

  return result;
}

function getWhatsappRouting(phoneNumberId) {
  return getChannelRouting('whatsapp', phoneNumberId);
}

function getTelegramRouting(botId) {
  return getChannelRouting('telegram', botId);
}

module.exports = { getWhatsappRouting, getTelegramRouting };
