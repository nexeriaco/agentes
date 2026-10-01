const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPendingOptionIndex,
  isPhoneOnlyRequest,
  isStateFollowUpMessage,
} = require('../src/services/followUp');

// Contexto guardado tras responder con la ficha CONTACTO de un colegio
// (case_group › case_subgroup, tal y como lo construye conversationState).
const CEIP_CONTEXT = 'Educación › CEIP Monte Anaor - teléfono, contacto (colegio, centro educativo, '
  + 'educación infantil y primaria; teléfono de CEIP Monte Anaor, teléfono del CEIP Monte Anaor, '
  + 'llamar a CEIP Monte Anaor, contacto CEIP Monte Anaor, número de CEIP Monte Anaor)';

test('isStateFollowUpMessage: reconoce seguimientos sobre el tema activo', () => {
  const followUps = [
    'y su número de teléfono',
    'y su teléfono',
    'su teléfono',
    'su número',
    'cuál es su teléfono',
    'dame su teléfono',
    'me das el teléfono?',
    '¿tienen email?',
    'a qué hora abre',
    'abre los sábados?',
    'y cuánto cuesta?',
    'necesito el número de teléfono de ese centro',
    '¿cuál es el teléfono de ese centro? lo necesito para hoy',
    'teléfono',
    'dime la dirección',
    '¿está abierto ahora?',
    'y de allí?',
    'cómo llego',
    'pásame el contacto',
    'y el teléfono del colegio?',
    'y el correo del CEIP Monte Anaor',
  ];
  for (const message of followUps) {
    assert.equal(isStateFollowUpMessage(message, CEIP_CONTEXT), true, message);
  }
});

test('isStateFollowUpMessage: un tema nuevo no arrastra el contexto', () => {
  const newTopics = [
    'y la biblioteca?',
    'teléfono de la biblioteca',
    'horario del polideportivo',
    'y el teléfono del instituto?',
    'quiero pedir cita previa',
    'cuánto cuesta el agua',
    'dónde está el ecoparque',
    'información sobre el pabellón de deportes',
  ];
  for (const message of newTopics) {
    assert.equal(isStateFollowUpMessage(message, CEIP_CONTEXT), false, message);
  }
});

test('isStateFollowUpMessage: sin señal de seguimiento no se pega al tema', () => {
  for (const message of ['hola', 'vale', 'gracias', 'ok']) {
    assert.equal(isStateFollowUpMessage(message, CEIP_CONTEXT), false, message);
  }
});

test('isStateFollowUpMessage: sin contexto o con mensaje largo no es seguimiento', () => {
  assert.equal(isStateFollowUpMessage('y su teléfono', null), false);
  assert.equal(isStateFollowUpMessage('y su teléfono', '   '), false);
  assert.equal(isStateFollowUpMessage('', CEIP_CONTEXT), false);
  const long = `y su teléfono ${'por favor '.repeat(12)}`;
  assert.equal(isStateFollowUpMessage(long, CEIP_CONTEXT), false);
});

test('isStateFollowUpMessage: compara plurales y tildes', () => {
  assert.equal(isStateFollowUpMessage('y el teléfono de los colegios', CEIP_CONTEXT), true);
  assert.equal(isStateFollowUpMessage('Y el TELÉFONO del COLEGIO?', CEIP_CONTEXT), true);
  // Palabra temática que no está en el contexto guardado → tema nuevo.
  assert.equal(isStateFollowUpMessage('¿y el teléfono de la piscina?', CEIP_CONTEXT), false);
});

test('isPhoneOnlyRequest: solo teléfono, sin otros datos', () => {
  assert.equal(isPhoneOnlyRequest('y su número de teléfono'), true);
  assert.equal(isPhoneOnlyRequest('su contacto'), true);
  assert.equal(isPhoneOnlyRequest('y su correo'), false);
  assert.equal(isPhoneOnlyRequest('y su email?'), false);
  assert.equal(isPhoneOnlyRequest('teléfono y horario'), false);
  assert.equal(isPhoneOnlyRequest('y su dirección'), false);
});

test('getPendingOptionIndex: elige opción 1-3 por posición', () => {
  assert.equal(getPendingOptionIndex('el primero'), 0);
  assert.equal(getPendingOptionIndex('la segunda'), 1);
  assert.equal(getPendingOptionIndex('opción 3'), 2);
  assert.equal(getPendingOptionIndex('2'), 1);
  assert.equal(getPendingOptionIndex('y su teléfono'), null);
  assert.equal(getPendingOptionIndex('horario'), null);
});
