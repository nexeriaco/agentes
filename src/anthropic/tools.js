// Tool de la API de Anthropic para leer en tiempo real páginas web y PDF
// públicos. Se ofrece a Claude cuando alguna instrucción/evento tiene
// allow_url_reading = true; el ejecutor real vive en services/urlTool.js.
const BUSCAR_URL_TOOL = {
  name: 'buscar_url',
  description:
    'Descarga y devuelve el contenido de una URL pública (página web o documento PDF). ' +
    'Si es una página web, devuelve su texto legible con los enlaces marcados entre corchetes ' +
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
};

module.exports = { BUSCAR_URL_TOOL };
