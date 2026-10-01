const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Falta la variable de entorno ANTHROPIC_API_KEY');
}

// Tope por llamada HTTP a Anthropic: evita que un cuelgue ocupe un hueco
// del paralelismo del poller de forma indefinida.
const parsedTimeout = Number.parseInt(
  process.env.ANTHROPIC_REQUEST_TIMEOUT_MS || '30000',
  10
);
const REQUEST_TIMEOUT_MS = Number.isFinite(parsedTimeout) && parsedTimeout >= 1000
  ? parsedTimeout
  : 30_000;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: REQUEST_TIMEOUT_MS,
});

module.exports = anthropic;
