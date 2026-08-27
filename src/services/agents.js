const supabase = require('../supabase/client');

async function getAgent(agentId) {
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, tone_instructions, escalation_contact')
    .eq('id', agentId)
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

module.exports = { getAgent };
