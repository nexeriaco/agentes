// Reglas puras (sin red ni Supabase) para decidir si un mensaje corto continúa
// el tema activo de la conversación ("¿y su número de teléfono?").
//
// Idea: con un tema activo (conversation_state), un mensaje corto es un
// seguimiento si pide un dato del tema ("teléfono", "horario"...) o usa un
// deíctico ("su", "ese", "allí") y NO introduce palabras temáticas que no
// estén ya en el contexto guardado. Si nombra algo nuevo ("¿y la biblioteca?")
// es un cambio de tema y no se arrastra el contexto.

const MAX_FOLLOW_UP_CHARS = 80;

// Longitud mínima de una palabra para que cuente como "temática".
const MIN_CONTENT_WORD_LENGTH = 4;

// Longitud mínima para comparar por prefijo (plurales: colegio/colegios).
const MIN_PREFIX_MATCH_LENGTH = 5;

function normalizeFollowUpText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function splitWords(text) {
  return normalizeFollowUpText(text).split(/[^a-z0-9]+/).filter(Boolean);
}

// Datos que se pueden pedir sobre un tema ya activo (señal de seguimiento).
const ATTRIBUTE_WORDS = new Set([
  'telefono', 'telefonos', 'numero', 'numeros', 'llamar', 'llamo', 'llamada',
  'llamadas', 'movil', 'contacto', 'contactos', 'contactar',
  'correo', 'correos', 'email', 'mail', 'whatsapp',
  'horario', 'horarios', 'hora', 'horas', 'abre', 'abren', 'abrir', 'abierto',
  'abierta', 'abiertos', 'cierra', 'cierran', 'cerrar', 'cerrado', 'cerrada',
  'direccion', 'direcciones', 'ubicacion', 'ubicado', 'ubicada', 'situado',
  'situada', 'localizacion', 'calle', 'llegar', 'llego', 'mapa',
  'web', 'pagina', 'enlace', 'link', 'url',
  'precio', 'precios', 'cuesta', 'cuestan', 'coste', 'costes', 'costo',
  'tarifa', 'tarifas', 'tasa', 'tasas', 'importe',
  'informacion', 'info', 'datos', 'dato', 'detalles', 'detalle',
]);

// Referencias al tema anterior (señal de seguimiento).
const DEICTIC_WORDS = new Set([
  'su', 'sus', 'ese', 'esa', 'eso', 'esos', 'esas', 'este', 'esta', 'esto',
  'alli', 'ahi', 'alla', 'mismo', 'misma', 'tambien', 'otro', 'otra',
]);

// Palabras que no identifican un tema: función gramatical, verbos de petición,
// cortesía, lugares genéricos y referencias temporales.
const FILLER_WORDS = new Set([
  'para', 'pero', 'como', 'cual', 'cuales', 'donde', 'cuando', 'cuanto',
  'cuanta', 'cuantos', 'cuantas', 'quien', 'quienes', 'sobre', 'entre',
  'desde', 'hasta', 'entonces', 'ademas', 'estos', 'estas', 'tiene', 'tienen',
  'tengo', 'hace', 'hacen', 'puedo', 'puede', 'pueden', 'puedes', 'podria',
  'podrian', 'podrias', 'quiero', 'quisiera', 'queria', 'necesito', 'necesita',
  'dame', 'dime', 'digame', 'deme', 'pasame', 'indicame', 'favor', 'porfa',
  'hola', 'gracias', 'buenas', 'buenos', 'dias', 'segun', 'todo', 'toda',
  'todos', 'todas', 'algo', 'nada', 'solo', 'bien', 'estan', 'estoy', 'estar',
  'otros', 'otras', 'nuestro', 'nuestra',
  // Elección entre opciones: "el segundo".
  'primero', 'primera', 'segundo', 'segunda', 'tercero', 'tercera', 'ultimo',
  'ultima', 'ambos', 'ambas',
  // Lugares genéricos: "el teléfono de ese centro".
  'centro', 'centros', 'sitio', 'lugar', 'edificio', 'establecimiento',
  // Referencias temporales: "¿abre los sábados?".
  'ahora', 'hoy', 'manana', 'tarde', 'tardes', 'noche', 'noches', 'semana',
  'fines', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
  'sabados', 'domingo', 'domingos', 'festivo', 'festivos', 'verano', 'invierno',
]);

function isContentWord(word) {
  return word.length >= MIN_CONTENT_WORD_LENGTH
    && !ATTRIBUTE_WORDS.has(word)
    && !DEICTIC_WORDS.has(word)
    && !FILLER_WORDS.has(word);
}

function contextHasWord(contextWords, word) {
  return contextWords.some((contextWord) => {
    if (contextWord === word) return true;
    const shortest = Math.min(contextWord.length, word.length);
    if (shortest < MIN_PREFIX_MATCH_LENGTH) return false;
    return contextWord.startsWith(word) || word.startsWith(contextWord);
  });
}

// ¿El mensaje introduce palabras temáticas que no aparecen en contextText?
// ("teléfono de la biblioteca" frente a un contexto sobre un colegio → sí).
function namesNewTopic(message, contextText) {
  const contextWords = splitWords(contextText);
  return splitWords(message)
    .filter(isContentWord)
    .some((word) => !contextHasWord(contextWords, word));
}

// ¿El mensaje continúa el tema descrito por contextText (título de la ficha
// de la última respuesta)? Devuelve false sin contexto, si el mensaje es largo,
// si no hay ninguna señal de seguimiento o si nombra algo ajeno al contexto.
function isStateFollowUpMessage(message, contextText) {
  const raw = String(message || '').trim();
  if (!raw || raw.length > MAX_FOLLOW_UP_CHARS) return false;
  if (!String(contextText || '').trim()) return false;

  const words = splitWords(raw);
  if (words.length === 0) return false;

  const hasCue = /^[¿\s]*y\s/i.test(raw)
    || words.some((word) => ATTRIBUTE_WORDS.has(word) || DEICTIC_WORDS.has(word));
  if (!hasCue) return false;

  return !namesNewTopic(raw, contextText);
}

// Petición que se contesta solo con un teléfono. Excluye mensajes que piden
// además (o en su lugar) otro dato: "¿y su correo?", "teléfono y horario".
const PHONE_REQUEST_WORDS = new Set([
  'telefono', 'telefonos', 'numero', 'numeros', 'llamar', 'llamo', 'llamada',
  'llamadas', 'movil', 'contacto', 'contactos', 'contactar',
]);

const OTHER_DATA_WORDS = new Set([
  'correo', 'correos', 'email', 'mail', 'whatsapp', 'horario', 'horarios',
  'hora', 'horas', 'abre', 'abren', 'abrir', 'abierto', 'abierta', 'abiertos',
  'cierra', 'cierran', 'cerrar', 'cerrado', 'cerrada', 'direccion',
  'direcciones', 'ubicacion', 'ubicado', 'ubicada', 'situado', 'situada',
  'localizacion', 'calle', 'llegar', 'llego', 'mapa', 'donde', 'web', 'pagina',
  'enlace', 'link', 'url', 'precio', 'precios', 'cuesta', 'cuestan', 'coste',
  'costes', 'costo', 'tarifa', 'tarifas', 'tasa', 'tasas', 'importe',
]);

function isPhoneOnlyRequest(message) {
  const words = splitWords(message);
  return words.some((word) => PHONE_REQUEST_WORDS.has(word))
    && !words.some((word) => OTHER_DATA_WORDS.has(word));
}

// "el primero", "la segunda", "2"... → índice 0..2 de la lista de opciones.
function getPendingOptionIndex(message) {
  const text = normalizeFollowUpText(message).trim();
  const match = text.match(
    /^(?:el|la|opcion)?\s*(primero|primera|segundo|segunda|tercero|tercera|1|2|3)\b/
  );
  if (!match) return null;

  const value = match[1];
  if (value === 'primero' || value === 'primera' || value === '1') return 0;
  if (value === 'segundo' || value === 'segunda' || value === '2') return 1;
  if (value === 'tercero' || value === 'tercera' || value === '3') return 2;
  return null;
}

module.exports = {
  MAX_FOLLOW_UP_CHARS,
  getPendingOptionIndex,
  isPhoneOnlyRequest,
  isStateFollowUpMessage,
  namesNewTopic,
};
