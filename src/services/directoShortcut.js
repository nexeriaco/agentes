// Atajo 'directo' genérico (todas las temáticas).
// La preferencia por entidad de teléfono vive en contactDirecto.js.

const { applyContactEntityPreference, isContactPhoneRow } = require('./contactDirecto');

// Similitud mínima para responder sin Claude (filas response_mode='directo').
const DIRECT_RESPONSE_THRESHOLD = 0.55;

// Holgura máxima respecto a la nº 1 global si no hay preferencia CONTACTO.
const DIRECT_RESPONSE_MAX_GAP_FROM_TOP = 0.02;

// Si las 2 mejores 'directo' empatan cerca → no atajo (Claude elige/pregunta).
const DIRECTO_AMBIGUITY_GAP = 0.03;

// Una ficha CONTACTO solo debe responder directamente cuando el ciudadano
// pide un dato de contacto. Evita que preguntas como "¿dónde está la
// biblioteca?" o "información sobre la escuela" devuelvan automáticamente
// el teléfono porque esa es la única ficha directa disponible.
const CONTACT_REQUEST_RE =
  /\b(telefono|numero|llamar|contacto|contactar|correo|email|e-mail)\b/;

function isContactRequest(citizenMessage) {
  const normalized = String(citizenMessage || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return CONTACT_REQUEST_RE.test(normalized);
}

function canUseDirecto(instr, citizenMessage) {
  return !isContactPhoneRow(instr) || isContactRequest(citizenMessage);
}

function isAmbiguousDirectoCluster(directoPool) {
  if (directoPool.length < 2) return false;
  const sorted = [...directoPool].sort((a, b) => b.similarity - a.similarity);
  return (sorted[0].similarity - sorted[1].similarity) < DIRECTO_AMBIGUITY_GAP;
}

// Elige la ficha 'directo' a devolver, o null para pasar a IA.
function pickBestDirecto(instructions, citizenMessage) {
  if (instructions.length === 1
    && instructions[0].response_mode === 'directo'
    && canUseDirecto(instructions[0], citizenMessage)) {
    return { instr: instructions[0], reason: 'sole' };
  }

  const pool = instructions.filter((instr) => instr.response_mode === 'directo'
    && instr.similarity >= DIRECT_RESPONSE_THRESHOLD
    && canUseDirecto(instr, citizenMessage));
  if (pool.length === 0) return null;

  const { pool: preferred, preferredContactEntity } = applyContactEntityPreference(
    pool,
    citizenMessage
  );

  const ranked = preferred
    .slice()
    .sort((a, b) => b.similarity - a.similarity);

  if (isAmbiguousDirectoCluster(ranked)) {
    return null;
  }

  const best = ranked[0];
  const topSim = instructions[0].similarity;

  // CONTACTO con entidad en la consulta: aceptar aunque no sea la nº 1 global.
  if (preferredContactEntity && isContactPhoneRow(best)) {
    return { instr: best, reason: 'contact_entity' };
  }

  if ((topSim - best.similarity) > DIRECT_RESPONSE_MAX_GAP_FROM_TOP) return null;
  return { instr: best, reason: 'top' };
}

module.exports = {
  pickBestDirecto,
  DIRECT_RESPONSE_THRESHOLD,
};
