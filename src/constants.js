// Teléfono general del Ayuntamiento (directorio / página principal).
// Se usa en el prompt cuando un documento no trae el dato.
// Si el agente tiene escalation_contact, ese valor tiene prioridad.
const DEFAULT_AYUNTAMIENTO_PHONE = '968 620 022';

// Respuesta fija al ciudadano cuando no hay match claro o Claude marca
// el sentinel interno (sin derivar a humano / teléfono).
const REFORMULATE_ANSWER =
  'La pregunta no es lo suficientemente clara o no he encontrado información al respecto. ¿Puedes reformularla? Gracias.';

module.exports = { DEFAULT_AYUNTAMIENTO_PHONE, REFORMULATE_ANSWER };
