const supabase = require('../supabase/client');

// Cuántos mensajes (usuario + asistente combinados) se recuperan como
// máximo para dar contexto a Claude en cada respuesta. Limita coste
// (tokens por llamada) sin cortar una conversación normal a medias.
const MAX_HISTORY_MESSAGES = 15;

// Si ha pasado más tiempo que esto desde el último mensaje de la
// conversación, se considera cerrada y se empieza de cero en vez de
// arrastrar contexto de una consulta antigua y probablemente distinta.
const SESSION_TIMEOUT_MINUTES = 45;

// Historial reciente de una conversación (identificada por canal + chat_id
// + agente), listo para anteponer al mensaje nuevo en el array `messages`
// de la API de Claude. Si el último mensaje es más antiguo que
// SESSION_TIMEOUT_MINUTES, se trata como conversación caducada y se
// devuelve vacío (nueva conversación), aunque haya filas más antiguas.
async function getRecentHistory(agentId, chatId) {
  const { data, error } = await supabase
    .from('conversation_history')
    .select('role, content, created_at')
    .eq('agent_id', agentId)
    .eq('chat_id', String(chatId))
    .order('id', { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (error) throw error;
  if (data.length === 0) return [];

  const minutesSinceLastMessage = (Date.now() - new Date(data[0].created_at).getTime()) / (1000 * 60);
  if (minutesSinceLastMessage > SESSION_TIMEOUT_MINUTES) return [];

  return data.reverse().map((row) => ({ role: row.role, content: row.content }));
}

// Guarda un turno completo (pregunta del ciudadano + respuesta final ya
// enviada) para que esté disponible como historial en el siguiente
// mensaje. Nunca se guarda aquí el texto intermedio del bucle de
// herramientas, solo lo que realmente se envió al ciudadano.
async function appendTurn(agentId, chatId, citizenMessage, botMessage) {
  const { error } = await supabase.from('conversation_history').insert([
    { agent_id: agentId, chat_id: String(chatId), role: 'user', content: citizenMessage },
    { agent_id: agentId, chat_id: String(chatId), role: 'assistant', content: botMessage },
  ]);

  if (error) throw error;
}

module.exports = { getRecentHistory, appendTurn };
