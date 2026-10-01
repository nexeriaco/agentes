const test = require('node:test');
const assert = require('node:assert/strict');
const { pickBestDirecto } = require('../src/services/directoShortcut');

function phoneRow(id, entity, similarity) {
  return {
    id,
    case_group: 'Educación',
    case_subgroup: `${entity} - teléfono, contacto (colegio, centro educativo; teléfono de ${entity}, `
      + `llamar a ${entity}, contacto ${entity}, número de ${entity})`,
    instruction: `El teléfono de ${entity} es el 968 000 000.`,
    response_mode: 'directo',
    similarity,
  };
}

const CEIP = phoneRow('a-ceip', 'CEIP Monte Anaor', 0.82);
const IES = phoneRow('b-ies', 'IES Villa de Alguazas', 0.78);
const TRAMITE = {
  id: 'c-tramite',
  case_group: 'Educación',
  case_subgroup: 'TRÁMITE · Salas y aulas de estudio',
  instruction: 'Info de salas de estudio',
  response_mode: 'ia',
  similarity: 0.7,
};
const CITA = {
  id: 'd-cita',
  case_group: 'Atención ciudadana',
  case_subgroup: 'Cita previa general con servicios municipales',
  instruction: 'Pide cita en https://ejemplo.es',
  response_mode: 'directo',
  similarity: 0.9,
};

const phoneFollowUp = (instructions, sourceId, message = 'y su número de teléfono') =>
  pickBestDirecto(instructions, message, { followUp: { sourceId } });

test('seguimiento: responde con el teléfono de la ficha activa', () => {
  const picked = phoneFollowUp([CEIP, IES], CEIP.id);
  assert.equal(picked.instr.id, CEIP.id);
  assert.equal(picked.reason, 'follow_up_entity');
});

test('seguimiento: la entidad la fija el estado, no la similitud', () => {
  // La búsqueda enriquecida deja al CEIP primero, pero el tema activo es el IES.
  const picked = phoneFollowUp([CEIP, IES], IES.id);
  assert.equal(picked.instr.id, IES.id);
});

test('seguimiento: no atajar si piden otro dato distinto del teléfono', () => {
  assert.equal(phoneFollowUp([CEIP], CEIP.id, 'y su correo'), null);
  assert.equal(phoneFollowUp([CEIP], CEIP.id, 'y su horario'), null);
  assert.equal(phoneFollowUp([CEIP], CEIP.id, 'teléfono y horario'), null);
});

test('seguimiento: no atajar si la ficha activa no está entre las recuperadas', () => {
  assert.equal(phoneFollowUp([IES], CEIP.id), null);
  assert.equal(phoneFollowUp([CEIP], null), null);
});

test('seguimiento: no atajar si la ficha activa no es CONTACTO', () => {
  assert.equal(phoneFollowUp([TRAMITE, CEIP], TRAMITE.id), null);
  assert.equal(phoneFollowUp([CITA, CEIP], CITA.id), null);
});

test('seguimiento: no atajar si la similitud es baja', () => {
  assert.equal(phoneFollowUp([{ ...CEIP, similarity: 0.5 }], CEIP.id), null);
});

test('sin seguimiento: se mantiene la lógica general', () => {
  const byEntity = pickBestDirecto([CEIP, IES], 'teléfono del CEIP Monte Anaor');
  assert.equal(byEntity.instr.id, CEIP.id);

  // Una ficha CONTACTO no responde si no piden un dato de contacto.
  assert.equal(pickBestDirecto([CEIP], 'información sobre el CEIP Monte Anaor'), null);

  // Una FAQ directa no-CONTACTO sigue atajándose.
  assert.equal(pickBestDirecto([CITA], 'quiero cita previa').instr.id, CITA.id);
});
