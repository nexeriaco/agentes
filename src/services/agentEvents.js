const supabase = require('../supabase/client');

const RECENT_PAST_WINDOW_DAYS = 60;

function subtractDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// Eventos relevantes de un agente para una fecha dada (formato 'YYYY-MM-DD'):
// active = true y end_date >= (fecha - 60 días). Sin límite superior, así
// que incluye pasado reciente, presentes y cualquier evento futuro; es
// tarea de quien arme el prompt (y de Claude) distinguir en curso/pasado/
// futuro a partir de start_date y end_date.
async function getRelevantEvents(agentId, today) {
  const cutoff = subtractDays(today, RECENT_PAST_WINDOW_DAYS);

  const { data, error } = await supabase
    .from('agent_events')
    .select('id, title, description, start_date, end_date, location, url, allow_url_reading')
    .eq('agent_id', agentId)
    .eq('active', true)
    .gte('end_date', cutoff);

  if (error) throw error;
  return data;
}

module.exports = { getRelevantEvents };
