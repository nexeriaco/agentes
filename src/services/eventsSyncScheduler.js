const { getTelegramRouting } = require('./routing');
const telegram = require('../telegram/client');

const DEFAULT_SYNC_INTERVAL_MINUTES = 60;

// Intervalo solo desde Railway (EVENTS_SYNC_INTERVAL_MINUTES). Sin var → 60 min.
function getSyncIntervalMs() {
  const raw = process.env.EVENTS_SYNC_INTERVAL_MINUTES;
  const minutes = raw ? Number.parseInt(raw, 10) : DEFAULT_SYNC_INTERVAL_MINUTES;
  if (!Number.isFinite(minutes) || minutes < 1) {
    console.warn(
      `Events sync: EVENTS_SYNC_INTERVAL_MINUTES inválido (${raw}); uso ${DEFAULT_SYNC_INTERVAL_MINUTES} min`
    );
    return DEFAULT_SYNC_INTERVAL_MINUTES * 60 * 1000;
  }
  return minutes * 60 * 1000;
}

async function runSyncOnce() {
  const routing = await getTelegramRouting(telegram.getBotId());
  if (!routing) {
    console.error('Events sync: no hay ruta activa de Telegram; se omite esta pasada.');
    return;
  }

  // Lazy: googleSheets/client lanza si faltan credenciales al cargar el módulo.
  const { syncAgentEvents } = require('./eventsSync');
  const { synced, deactivated } = await syncAgentEvents(routing.agentId);
  console.log(
    `Events sync: ${synced} fila(s), ${deactivated} desactivada(s) para agent=${routing.agentId}`
  );
}

function startEventsSyncScheduler() {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64) {
    console.log('Events sync: omitido (faltan GOOGLE_SHEET_ID o GOOGLE_SHEETS_CREDENTIALS_BASE64)');
    return;
  }

  const syncIntervalMs = getSyncIntervalMs();
  console.log(`Events sync: activo (cada ${syncIntervalMs / 60000} min)`);

  const tick = () => {
    runSyncOnce().catch((err) => {
      console.error('Events sync: error:', err);
    });
  };

  tick();
  setInterval(tick, syncIntervalMs);
}

module.exports = { startEventsSyncScheduler };
