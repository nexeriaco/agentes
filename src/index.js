require('dotenv').config();

const express = require('express');
const whatsappRouter = require('./routes/whatsapp');
const { startPolling } = require('./telegram/poller');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/whatsapp', whatsappRouter);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});

startPolling().catch((err) => {
  console.error('El polling de Telegram se detuvo inesperadamente:', err);
});
