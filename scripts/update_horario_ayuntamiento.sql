  -- Ayuntamiento: frases exactas al inicio del subgrupo + regenerar embedding
  -- Luego: node scripts/generar_embeddings.js
  -- Además DESPLEGAR answer.js (atajo CONTACTO exige mención de entidad en la consulta)
  UPDATE agent_instructions
  SET
    case_subgroup = 'Teléfono del ayuntamiento. Horario del ayuntamiento. Ayuntamiento de Alguazas - teléfono, contacto, horario (centralita, atención al público, 968 620 022, info@alguazas.es)',
    instruction = 'El teléfono del Ayuntamiento de Alguazas es el 968 620 022. Horario de atención al público: lunes a viernes de 8:30 a 14:30 h. Dirección: Plaza Don Enrique Tierno Galván, 1. Email: info@alguazas.es.',
    associated_url = '',
    embedding = NULL
  WHERE id = 'ba9cac7f-ad13-43b4-aceb-25326bc485a7';
