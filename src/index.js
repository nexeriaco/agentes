require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
// WhatsApp desactivado hasta reactivar con verify + firma Meta.
// const whatsappRouter = require('./routes/whatsapp');
const { startPolling } = require('./telegram/poller');
const { startEventsSyncScheduler } = require('./services/eventsSyncScheduler');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// app.use('/whatsapp', whatsappRouter);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});

startPolling().catch((err) => {
  console.error('El polling de Telegram se detuvo inesperadamente:', err);
});

startEventsSyncScheduler();
