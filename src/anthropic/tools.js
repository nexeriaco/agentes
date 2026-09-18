// Tool de la API de Anthropic para leer en tiempo real páginas web y PDF
// públicos. Se ofrece a Claude cuando alguna instrucción/evento tiene
// allow_url_reading = true; el ejecutor real vive en services/urlTool.js.
const BUSCAR_URL_TOOL = {
  name: 'buscar_url',
  description:
    'Descarga y devuelve el contenido de una URL pública (página web o documento PDF). ' +
    'En páginas o PDFs largos puede devolver extractos filtrados según la pregunta del ciudadano ' +
    '(no necesariamente el documento entero); úsalos igual para responder. ' +
    'Si es una página web, el texto incluye los enlaces marcados entre corchetes ' +
    'justo en el punto del texto donde aparecen, para poder identificar cuál corresponde a qué ' +
    'tema o documento. Si es un PDF, devuelve el texto extraído del documento; si el PDF no tiene ' +
    'texto extraíble (por ejemplo, por ser un escaneo), devuelve sus páginas como imágenes para que ' +
    'las puedas leer visualmente. No se procesan documentos de más de 20MB.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'La URL exacta a consultar, tal como aparece en la fuente (nunca inventada).',
      },
    },
    required: ['url'],
  },
  // La definición de la tool es idéntica en cada llamada de una misma
  // conversación (y, en la práctica, entre conversaciones del mismo
  // agente): se cachea junto con el system prompt, que se cierra con su
  // propio cache_control justo a continuación en la llamada a la API.
  cache_control: { type: 'ephemeral' },
};

module.exports = { BUSCAR_URL_TOOL };
