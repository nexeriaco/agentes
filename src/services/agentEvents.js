const supabase = require('../supabase/client');

// Solo eventos aún vigentes o que empiezan en los próximos N días.
// Los YA FINALIZÓ no se envían al prompt (no deben afectar la respuesta
// y consumían tokens innecesarios en el bloque cacheado).
const FUTURE_WINDOW_DAYS = 90;

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(isoTimestamp) {
  return isoTimestamp ? isoTimestamp.slice(0, 10) : null;
}

// Incluye EN CURSO (end_date >= hoy o sin end_date), y FUTURO con
// start_date <= hoy+90. Sin fecha fin = vigente hasta desactivarlo.
// Excluye finalizados y futuros lejanos.
function isWithinPromptWindow(event, today) {
  const start = formatDate(event.start_date);
  const end = formatDate(event.end_date);
  const futureCutoff = addDays(today, FUTURE_WINDOW_DAYS);

  if (end && end < today) return false;
  if (start && start > futureCutoff) return false;
  return true;
}

// Eventos relevantes de un agente para una fecha dada (formato 'YYYY-MM-DD'):
// active = true; end_date >= hoy o null; ventana futura en JS.
async function getRelevantEvents(agentId, today) {
  const { data, error } = await supabase
    .from('agent_events')
    .select('id, title, description, start_date, end_date, location, url, allow_url_reading')
    .eq('agent_id', agentId)
    .eq('active', true)
    .or(`end_date.gte.${today},end_date.is.null`)
    .order('id');

  if (error) throw error;
  return data.filter((event) => isWithinPromptWindow(event, today));
}

module.exports = { getRelevantEvents };
