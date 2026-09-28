const { sheets } = require('../googleSheets/client');
const supabase = require('../supabase/client');

// Mapea encabezados normalizados (sin acentos, en minúscula, con "_" en vez
// de espacios) de la hoja a las columnas de agent_events.
const FIELD_BY_HEADER = {
  titulo: 'title',
  descripcion: 'description',
  fecha_inicio: 'start_date',
  fecha_fin: 'end_date',
  ubicacion: 'location',
  enlace: 'url',
  permite_lectura_url: 'allow_url_reading',
  activo: 'active',
};

function normalizeHeader(header) {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

// La hoja trae fechas en formato DD/MM/AAAA.
function parseSpanishDate(value) {
  if (!value) return null;
  const [day, month, year] = value.split('/');
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseBoolean(value) {
  return (value || '').trim().toUpperCase() === 'TRUE';
}

function rowToEvent(headers, row, agentId) {
  const event = { agent_id: agentId };

  headers.forEach((header, i) => {
    const field = FIELD_BY_HEADER[normalizeHeader(header)];
    if (!field) return;

    const raw = row[i] || '';
    if (field === 'start_date' || field === 'end_date') {
      event[field] = parseSpanishDate(raw);
    } else if (field === 'allow_url_reading' || field === 'active') {
      event[field] = parseBoolean(raw);
    } else {
      event[field] = raw || null;
    }
  });

  return event;
}

// Misma clave lógica que el UNIQUE (agent_id, title, start_date).
function eventKey(title, startDate) {
  const start = startDate ? String(startDate).slice(0, 10) : '';
  return `${title}|${start}`;
}

// Desactiva filas del agente que ya no aparecen en la hoja (reconcile).
// No borra: active=false las saca del prompt (getRelevantEvents filtra active).
async function deactivateMissingEvents(agentId, sheetEvents) {
  const kept = new Set(sheetEvents.map((event) => eventKey(event.title, event.start_date)));

  const { data: existing, error } = await supabase
    .from('agent_events')
    .select('id, title, start_date')
    .eq('agent_id', agentId)
    .eq('active', true);

  if (error) throw error;

  const toDeactivate = (existing || []).filter(
    (row) => !kept.has(eventKey(row.title, row.start_date))
  );

  if (toDeactivate.length === 0) return 0;

  const { error: updateError } = await supabase
    .from('agent_events')
    .update({ active: false })
    .in(
      'id',
      toDeactivate.map((row) => row.id)
    );

  if (updateError) throw updateError;
  return toDeactivate.length;
}

// Lee todas las filas de la hoja indicada en GOOGLE_SHEET_ID, hace upsert
// en agent_events (conflicto por agent_id+title+start_date) y desactiva
// las filas activas del agente que ya no están en la hoja.
async function syncAgentEvents(agentId) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetTitle = meta.data.sheets[0].properties.title;

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetTitle,
  });

  const [headers, ...rows] = data.values || [];
  // Sin cabeceras: no tocamos DB (posible fallo/hoja vacía inesperada).
  if (!headers) return { synced: 0, deactivated: 0 };

  const events = rows
    .map((row) => rowToEvent(headers, row, agentId))
    .filter((event) => event.title);

  if (events.length > 0) {
    const { error } = await supabase
      .from('agent_events')
      .upsert(events, { onConflict: 'agent_id,title,start_date' });

    if (error) throw error;
  }

  const deactivated = await deactivateMissingEvents(agentId, events);

  return { synced: events.length, deactivated };
}

module.exports = { syncAgentEvents };
