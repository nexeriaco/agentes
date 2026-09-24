-- Regenera embeddings de todas las fichas CONTACTO (teléfono) activas.
-- Evita que una consulta vaga/específica confunda Ecoparque vs Biblioteca vs Ayuntamiento, etc.
-- Luego: node scripts/generar_embeddings.js

-- Albergue de Protección Animal
UPDATE agent_instructions
SET
  case_subgroup = 'Albergue de Protección Animal - teléfono, contacto (perrera, animales abandonados, adopción de animales; teléfono de Albergue de Protección Animal, teléfono del Albergue de Protección Animal, llamar a Albergue de Protección Animal, contacto Albergue de Protección Animal, número de Albergue de Protección Animal)',
  instruction = 'El teléfono de Albergue de Protección Animal es el 661 385 830.',
  associated_url = '',
  embedding = NULL
WHERE id = '081fe368-396f-4145-9af0-a474255839e0';

-- Servicio de Información Juvenil
UPDATE agent_instructions
SET
  case_subgroup = 'Servicio de Información Juvenil - teléfono, contacto (juventud, jóvenes, información juvenil, carnet joven; teléfono de Servicio de Información Juvenil, teléfono del Servicio de Información Juvenil, llamar a Servicio de Información Juvenil, contacto Servicio de Información Juvenil, número de Servicio de Información Juvenil)',
  instruction = 'El teléfono de Servicio de Información Juvenil es el 675 091 487.',
  associated_url = '',
  embedding = NULL
WHERE id = '0c6e445f-5c7a-44d3-9b22-40e8baaa6981';

-- Campo de Fútbol
UPDATE agent_instructions
SET
  case_subgroup = 'Campo de Fútbol - teléfono, contacto (fútbol, instalación deportiva; teléfono de Campo de Fútbol, teléfono del Campo de Fútbol, llamar a Campo de Fútbol, contacto Campo de Fútbol, número de Campo de Fútbol)',
  instruction = 'El teléfono de Campo de Fútbol es el 654 009 878.',
  associated_url = '',
  embedding = NULL
WHERE id = '29cf22a0-c465-4cdb-a9c8-a469d94a7361';

-- Oficina Técnica
UPDATE agent_instructions
SET
  case_subgroup = 'Oficina Técnica - teléfono, contacto (obras, licencias de obra, urbanismo; teléfono de Oficina Técnica, teléfono del Oficina Técnica, llamar a Oficina Técnica, contacto Oficina Técnica, número de Oficina Técnica)',
  instruction = 'El teléfono de Oficina Técnica es el 654 009 895.',
  associated_url = '',
  embedding = NULL
WHERE id = '53215c0b-8a9f-4d74-9364-c404ae29ad27';

-- Biblioteca Municipal
UPDATE agent_instructions
SET
  case_subgroup = 'Biblioteca Municipal - teléfono, contacto (libros, préstamo, sala de estudio; teléfono de Biblioteca Municipal, teléfono del Biblioteca Municipal, llamar a Biblioteca Municipal, contacto Biblioteca Municipal, número de Biblioteca Municipal)',
  instruction = 'El teléfono de Biblioteca Municipal es el 968 622 143.',
  associated_url = '',
  embedding = NULL
WHERE id = '61146d49-2896-48ac-8874-7550635a073e';

-- Servicio Municipal de Aguas
UPDATE agent_instructions
SET
  case_subgroup = 'Servicio Municipal de Aguas - teléfono, contacto (agua, suministro de agua, averías de agua, facturas de agua; teléfono de Servicio Municipal de Aguas, teléfono del Servicio Municipal de Aguas, llamar a Servicio Municipal de Aguas, contacto Servicio Municipal de Aguas, número de Servicio Municipal de Aguas)',
  instruction = 'El teléfono de Servicio Municipal de Aguas es el 968 649 050.',
  associated_url = '',
  embedding = NULL
WHERE id = '672224a2-e553-40a9-a736-a9085f1bbb40';

-- Concejalía de Educación
UPDATE agent_instructions
SET
  case_subgroup = 'Concejalía de Educación - teléfono, contacto (colegios, centros educativos, educación; teléfono de Concejalía de Educación, teléfono del Concejalía de Educación, llamar a Concejalía de Educación, contacto Concejalía de Educación, número de Concejalía de Educación)',
  instruction = 'El teléfono de Concejalía de Educación es el 654 009 903.',
  associated_url = '',
  embedding = NULL
WHERE id = '7432e68d-a7c9-4492-b0cc-d68035cc8f24';

-- Ecoparque Municipal
UPDATE agent_instructions
SET
  case_subgroup = 'Ecoparque Municipal - teléfono, contacto (reciclaje, punto limpio, residuos, escombros; teléfono de Ecoparque Municipal, teléfono del Ecoparque Municipal, llamar a Ecoparque Municipal, contacto Ecoparque Municipal, número de Ecoparque Municipal)',
  instruction = 'El teléfono de Ecoparque Municipal es el 654 009 879.',
  associated_url = '',
  embedding = NULL
WHERE id = '7adde5ac-60de-4fee-81ae-f5b4823ad8d2';

-- CES Vega Media
UPDATE agent_instructions
SET
  case_subgroup = 'CES Vega Media - teléfono, contacto (centro de educación secundaria, instituto; teléfono de CES Vega Media, teléfono del CES Vega Media, llamar a CES Vega Media, contacto CES Vega Media, número de CES Vega Media)',
  instruction = 'El teléfono de CES Vega Media es el 968 620 913.',
  associated_url = '',
  embedding = NULL
WHERE id = '7e4e9971-4019-48e0-aadc-9fea73a7897c';

-- Guardia Civil
UPDATE agent_instructions
SET
  case_subgroup = 'Guardia Civil - teléfono, contacto (emergencias, seguridad, denuncias graves; teléfono de Guardia Civil, teléfono del Guardia Civil, llamar a Guardia Civil, contacto Guardia Civil, número de Guardia Civil)',
  instruction = 'El teléfono de Guardia Civil es el 062.',
  associated_url = '',
  embedding = NULL
WHERE id = '7ede8674-b79e-40b0-81a4-2bf4668494c3';

-- CEIP Monte Anaor
UPDATE agent_instructions
SET
  case_subgroup = 'CEIP Monte Anaor - teléfono, contacto (colegio, centro educativo, educación infantil y primaria; teléfono de CEIP Monte Anaor, teléfono del CEIP Monte Anaor, llamar a CEIP Monte Anaor, contacto CEIP Monte Anaor, número de CEIP Monte Anaor)',
  instruction = 'El teléfono de CEIP Monte Anaor es el 968 620 302.',
  associated_url = '',
  embedding = NULL
WHERE id = '92d95e18-6cd9-46cf-a620-14eefc542a35';

-- Agencia de Desarrollo Local
UPDATE agent_instructions
SET
  case_subgroup = 'Agencia de Desarrollo Local - teléfono, contacto (empleo, formación, orientación laboral, empresas; teléfono de Agencia de Desarrollo Local, teléfono del Agencia de Desarrollo Local, llamar a Agencia de Desarrollo Local, contacto Agencia de Desarrollo Local, número de Agencia de Desarrollo Local)',
  instruction = 'El teléfono de Agencia de Desarrollo Local es el 654 009 902.',
  associated_url = '',
  embedding = NULL
WHERE id = '9a6bc2ed-5d9e-407d-a4b9-3504607fb093';

-- Juzgado de Paz
UPDATE agent_instructions
SET
  case_subgroup = 'Juzgado de Paz - teléfono, contacto (justicia, trámites judiciales, registro civil; teléfono de Juzgado de Paz, teléfono del Juzgado de Paz, llamar a Juzgado de Paz, contacto Juzgado de Paz, número de Juzgado de Paz)',
  instruction = 'El teléfono de Juzgado de Paz es el 968 621 086.',
  associated_url = '',
  embedding = NULL
WHERE id = '9ad62a16-614f-49e3-b518-ad85944f507c';

-- CEIP Nuestra Señora del Carmen
UPDATE agent_instructions
SET
  case_subgroup = 'CEIP Nuestra Señora del Carmen - teléfono, contacto (colegio, centro educativo, educación infantil y primaria; teléfono de CEIP Nuestra Señora del Carmen, teléfono del CEIP Nuestra Señora del Carmen, llamar a CEIP Nuestra Señora del Carmen, contacto CEIP Nuestra Señora del Carmen, número de CEIP Nuestra Señora del Carmen)',
  instruction = 'El teléfono de CEIP Nuestra Señora del Carmen es el 968 620 204.',
  associated_url = '',
  embedding = NULL
WHERE id = 'a4f224d3-a72a-4847-a9fb-b120ed3acd11';

-- Ayuntamiento de Alguazas
UPDATE agent_instructions
SET
  case_subgroup = 'Ayuntamiento de Alguazas - teléfono, contacto, horario (horario del ayuntamiento, a qué hora abre, atención al público, centralita, dirección, email info, 968 620 022; teléfono de Ayuntamiento de Alguazas, teléfono del Ayuntamiento de Alguazas, llamar a Ayuntamiento de Alguazas, contacto Ayuntamiento de Alguazas, número de Ayuntamiento de Alguazas, horario del ayuntamiento, a qué hora abre el ayuntamiento, horario de atención al público, centralita)',
  instruction = 'El teléfono del Ayuntamiento de Alguazas es el 968 620 022. Horario de atención al público: lunes a viernes de 8:30 a 14:30 h. Dirección: Plaza Don Enrique Tierno Galván, 1. Email: info@alguazas.es.',
  associated_url = '',
  embedding = NULL
WHERE id = 'ba9cac7f-ad13-43b4-aceb-25326bc485a7';

-- Escuela Infantil Reina Sofía
UPDATE agent_instructions
SET
  case_subgroup = 'Escuela Infantil Reina Sofía - teléfono, contacto (guardería, escuela infantil, 0-3 años; teléfono de Escuela Infantil Reina Sofía, teléfono del Escuela Infantil Reina Sofía, llamar a Escuela Infantil Reina Sofía, contacto Escuela Infantil Reina Sofía, número de Escuela Infantil Reina Sofía)',
  instruction = 'El teléfono de Escuela Infantil Reina Sofía es el 654 009 924.',
  associated_url = '',
  embedding = NULL
WHERE id = 'c2487ccc-b1c9-4a06-bec6-61443b550766';

-- Policía Local
UPDATE agent_instructions
SET
  case_subgroup = 'Policía Local - teléfono, contacto (seguridad, emergencias no graves, multas, denuncias; teléfono de Policía Local, teléfono del Policía Local, llamar a Policía Local, contacto Policía Local, número de Policía Local)',
  instruction = 'El teléfono de Policía Local es el 968 620 987.',
  associated_url = '',
  embedding = NULL
WHERE id = 'd7bda236-4286-45b6-b02f-25188f62543c';

-- Centro de Salud
UPDATE agent_instructions
SET
  case_subgroup = 'Centro de Salud - teléfono, contacto (médico, sanidad, consulta médica, urgencias; teléfono de Centro de Salud, teléfono del Centro de Salud, llamar a Centro de Salud, contacto Centro de Salud, número de Centro de Salud)',
  instruction = 'El teléfono de Centro de Salud es el 968 621 212.',
  associated_url = '',
  embedding = NULL
WHERE id = 'd83c1713-a8b1-4283-83bf-abf22cce5388';

-- IES Villa de Alguazas
UPDATE agent_instructions
SET
  case_subgroup = 'IES Villa de Alguazas - teléfono, contacto (instituto, educación secundaria, bachillerato; teléfono de IES Villa de Alguazas, teléfono del IES Villa de Alguazas, llamar a IES Villa de Alguazas, contacto IES Villa de Alguazas, número de IES Villa de Alguazas)',
  instruction = 'El teléfono de IES Villa de Alguazas es el 968 622 305.',
  associated_url = '',
  embedding = NULL
WHERE id = 'e8ce23af-fcee-44f6-b5f9-3b1eb4808e35';

-- Concejalía de Deportes
UPDATE agent_instructions
SET
  case_subgroup = 'Concejalía de Deportes - teléfono, contacto (deporte, instalaciones deportivas, actividades deportivas; teléfono de Concejalía de Deportes, teléfono del Concejalía de Deportes, llamar a Concejalía de Deportes, contacto Concejalía de Deportes, número de Concejalía de Deportes)',
  instruction = 'El teléfono de Concejalía de Deportes es el 609 201 423.',
  associated_url = '',
  embedding = NULL
WHERE id = 'fbda0944-3833-4d61-a991-0ecdd87c1550';

-- Polideportivo Municipal
UPDATE agent_instructions
SET
  case_subgroup = 'Polideportivo Municipal - teléfono, contacto (instalaciones deportivas, deporte, pistas; teléfono de Polideportivo Municipal, teléfono del Polideportivo Municipal, llamar a Polideportivo Municipal, contacto Polideportivo Municipal, número de Polideportivo Municipal)',
  instruction = 'El teléfono de Polideportivo Municipal es el 654 009 925.',
  associated_url = '',
  embedding = NULL
WHERE id = 'ffb1bc70-0e0e-47f2-b000-95fba62d4763';

-- Servicios Sociales
UPDATE agent_instructions
SET
  case_subgroup = 'Servicios Sociales - teléfono, contacto (ayudas sociales, trabajador/a social, dependencia, ayuda a domicilio; teléfono de Servicios Sociales, teléfono del Servicios Sociales, llamar a Servicios Sociales, contacto Servicios Sociales, número de Servicios Sociales)',
  instruction = 'El teléfono de Servicios Sociales es el 654 009 885.',
  associated_url = '',
  embedding = NULL
WHERE id = 'ffd01d66-3f7a-4c04-9745-f93f2b24aa55';
