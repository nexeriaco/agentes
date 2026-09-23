// Canal WhatsApp fuera de servicio a propósito: no se monta en index.js
// hasta reactivar con WHATSAPP_VERIFY_TOKEN no vacío + firma X-Hub-Signature-256.
const express = require('express');

const router = express.Router();

// Meta exige este endpoint GET para verificar el webhook al configurarlo
// en la app de Meta for Developers (hub.challenge handshake).
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Endpoint que recibe los eventos de WhatsApp (mensajes entrantes, etc.).
// Por ahora solo confirma recepción; el enrutamiento por tenant y la
// generación de respuesta se añaden más adelante.
router.post('/webhook', (req, res) => {
  res.sendStatus(200);
});

module.exports = router;
