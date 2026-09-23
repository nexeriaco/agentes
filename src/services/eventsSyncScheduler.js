const { getTelegramRouting } = require('./routing');
const telegram = require('../telegram/client');

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

async function runSyncOnce() {
  const routing = await getTelegramRouting(telegram.getBotId());
  if (!routing) {
    console.error('Events sync: no hay ruta activa de Telegram; se omite esta pasada.');
    return;
  }

  // Lazy: googleSheets/client lanza si faltan credenciales al cargar el módulo.
  const { syncAgentEvents } = require('./eventsSync');
  const { synced } = await syncAgentEvents(routing.agentId);
  console.log(`Events sync: ${synced} fila(s) para agent=${routing.agentId}`);
}

function startEventsSyncScheduler() {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64) {
    console.log('Events sync: omitido (faltan GOOGLE_SHEET_ID o GOOGLE_SHEETS_CREDENTIALS_BASE64)');
    return;
  }

  console.log(`Events sync: activo (cada ${SYNC_INTERVAL_MS / 60000} min)`);

  const tick = () => {
    runSyncOnce().catch((err) => {
      console.error('Events sync: error:', err);
    });
  };

  tick();
  setInterval(tick, SYNC_INTERVAL_MS);
}

module.exports = { startEventsSyncScheduler };
