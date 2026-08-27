const supabase = require('../supabase/client');

// Dado un agentId, devuelve todas las instrucciones activas de ese agente
// (una fila por case_group). No decide cuál aplica a una consulta concreta;
// eso se resuelve más adelante al construir el prompt para Claude.
async function getAgentInstructions(agentId) {
  const { data, error } = await supabase
    .from('agent_instructions')
    .select('id, case_group, instruction, associated_url, allow_url_reading')
    .eq('agent_id', agentId)
    .eq('active', true);

  if (error) throw error;
  return data;
}

module.exports = { getAgentInstructions };
