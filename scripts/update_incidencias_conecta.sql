-- 4 filas: incidencias urbanas, app Conect@, Te Escuchamos, horario ayuntamiento
-- Incidencias = app/mail. Participa = solo quejas/sugerencias.
-- Luego: node scripts/generar_embeddings.js

-- Incidencias urbanas
UPDATE agent_instructions
SET
  case_subgroup = 'Incidencias urbanas: farola fundida, farola rota, bombilla de la calle, losa rota, acera rota, calle sucia, mobiliario urbano, cómo aviso / dónde denuncio / reportar o notificar una incidencia urbana',
  instruction = '¿Una farola fundida, una losa rota o una calle sucia? El canal para presentar incidencias urbanas es la app municipal Alguazas Conect@. Descárgala para Android en Google Play: https://play.google.com/store/apps/details?id=com.appalguazasayto.appmiciudad&pcampaignid=web_share, y para iPhone en la App Store: https://apps.apple.com/us/app/ayuntamiento-de-alguazas/id1553814960?at=&ign-mpt=uo%3D4. Si no puedes hacerlo por la app, escríbenos al mail de atención al ciudadano: info@alguazas.es.',
  associated_url = 'https://alguazas.es/alguazas-conect-la-app-del-ayuntamiento-de-alguazas/',
  embedding = NULL
WHERE id = '43cf1419-1b22-4b32-bc23-c11ada715ea5';

-- App Alguazas Conect@
UPDATE agent_instructions
SET
  case_subgroup = 'App municipal Alguazas Conect@ (Android e iOS): qué es Alguazas Conect@, app del ayuntamiento, aplicación móvil municipal, descargar app Alguazas, reportar incidencias por la app',
  instruction = 'Alguazas Conect@ es la app oficial del Ayuntamiento de Alguazas: te permite recibir notificaciones de noticias y eventos, reportar incidencias, pedir cita previa y hacer trámites municipales, entre otras cosas. Descárgala para Android en Google Play: https://play.google.com/store/apps/details?id=com.appalguazasayto.appmiciudad&pcampaignid=web_share, y para iPhone en la App Store: https://apps.apple.com/us/app/ayuntamiento-de-alguazas/id1553814960?at=&ign-mpt=uo%3D4. Para presentar incidencias, usa la app; si no puedes, escribe al mail de atención al ciudadano: info@alguazas.es.',
  associated_url = 'https://alguazas.es/alguazas-conect-la-app-del-ayuntamiento-de-alguazas/',
  embedding = NULL
WHERE id = '8728f6b5-1fae-46df-8730-70ed529633a3';

-- Te Escuchamos
UPDATE agent_instructions
SET
  case_subgroup = 'Te Escuchamos (quejas, sugerencias y opiniones ciudadanas)',
  instruction = 'Trámite o recurso municipal: Te Escuchamos (solo quejas, sugerencias y opiniones). IMPORTANTE: las incidencias (farola, losa, calle sucia, mobiliario u otras) YA NO se presentan por Participa; el canal es la app Alguazas Conect@ o el mail info@alguazas.es. Si preguntan por una incidencia, indícales ese canal y no este portal. Para quejas o sugerencias generales, consulta la información actualizada en: https://participa.alguazas.es/te-escuchamos/ Extrae solo lo necesario con tono cercano. Termina con una coletilla que incluya este enlace solo si la consulta es de queja/sugerencia: https://participa.alguazas.es/te-escuchamos/',
  associated_url = 'https://participa.alguazas.es/te-escuchamos/',
  embedding = NULL
WHERE id = '4c434bc3-d3f6-42af-b120-ebe0d7a5422e';

-- Horario / contacto Ayuntamiento
UPDATE agent_instructions
SET
  case_subgroup = 'Ayuntamiento: horario de apertura, horario de atención al público, dirección, teléfono, email, cuándo abre el ayuntamiento, horario del ayuntamiento',
  instruction = 'El Ayuntamiento de Alguazas está en Plaza Don Enrique Tierno Galván, 1. Horario de atención al público: lunes a viernes de 8:30 a 14:30 h. Teléfono: 968 620 022. Email: info@alguazas.es.',
  associated_url = '',
  embedding = NULL
WHERE id = 'ba9cac7f-ad13-43b4-aceb-25326bc485a7';
