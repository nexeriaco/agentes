const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Falta la variable de entorno ANTHROPIC_API_KEY');
}

// Tope por llamada HTTP a Anthropic: evita que un cuelgue ocupe un hueco
// del paralelismo del poller de forma indefinida.
const REQUEST_TIMEOUT_MS = 60_000;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: REQUEST_TIMEOUT_MS,
});

module.exports = anthropic;
module.exports.REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_MS;
