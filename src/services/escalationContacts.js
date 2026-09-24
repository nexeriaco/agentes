const supabase = require('../supabase/client');

// Contactos de derivación por concejalía/área (case_group) de un agente.
// Se usan en <doc_miss> del prompt: cuando un documento no trae el dato,
// Claude indica el contacto de la concejalía del caso consultado. Si la
// tabla falla o está vacía se devuelve [] y el prompt cae al contacto
// genérico del agente (agent.escalation_contact).
async function getEscalationContacts(agentId) {
  const { data, error } = await supabase
    .from('escalation_contacts')
    .select('case_group, contact')
    .eq('agent_id', agentId)
    .eq('active', true)
    .order('case_group');

  if (error) {
    console.error('Error leyendo escalation_contacts:', error);
    return [];
  }
  return data || [];
}

module.exports = { getEscalationContacts };
