// Reglas específicas de fichas CONTACTO (teléfono).
// Separadas del atajo 'directo' general: solo aplican a filas cuyo
// case_subgroup sigue el patrón "… - teléfono, contacto …".

const CONTACT_STOPWORDS = new Set([
  'municipal', 'municipales', 'servicio', 'servicios', 'concejalia',
  'oficina', 'centro', 'local', 'alguazas', 'villa', 'reina',
  'telefono', 'horario', 'contacto', 'numero', 'llamar', 'centralita',
  'atencion', 'publico', 'email', 'direccion', 'info',
]);

function normalizeContactText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isContactPhoneRow(instr) {
  const sub = normalizeContactText(instr.case_subgroup);
  return sub.includes('telefono, contacto');
}

function contactEntityName(instr) {
  const sub = String(instr.case_subgroup || '');
  // "Teléfono del ayuntamiento. … Ayuntamiento de Alguazas - teléfono …"
  const dashTel = sub.match(/([^-]+?)\s*-\s*tel/i);
  if (dashTel) return dashTel[1].replace(/^.*\.\s*/, '').trim();
  return sub.trim();
}

function queryMentionsContactEntity(query, entityName) {
  const q = normalizeContactText(query);
  const name = normalizeContactText(entityName);
  if (name && q.includes(name)) return true;
  const tokens = name
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !CONTACT_STOPWORDS.has(t));
  return tokens.some((t) => q.includes(t));
}

// Si hay fichas CONTACTO en el pool, prefiere las cuya entidad aparece
// en la consulta (evita Polideportivo ganando a "ayuntamiento").
// Si ninguna CONTACTO menciona entidad, deja el pool intacto.
// Devuelve { pool, preferredContactEntity }.
function applyContactEntityPreference(directoPool, citizenMessage) {
  const hasContact = directoPool.some(isContactPhoneRow);
  if (!hasContact) {
    return { pool: directoPool, preferredContactEntity: false };
  }

  const mentioned = directoPool.filter((instr) => !isContactPhoneRow(instr)
    || queryMentionsContactEntity(citizenMessage, contactEntityName(instr)));

  if (mentioned.length === 0) {
    return { pool: directoPool, preferredContactEntity: false };
  }

  const preferredContactEntity = mentioned.some(isContactPhoneRow);
  return { pool: mentioned, preferredContactEntity };
}

module.exports = {
  isContactPhoneRow,
  applyContactEntityPreference,
};
