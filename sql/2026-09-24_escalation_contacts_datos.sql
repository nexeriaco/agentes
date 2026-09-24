-- Datos de escalation_contacts para el agente de Alguazas.
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- 2026-09-24_escalation_contacts.sql (crea la tabla).
--
-- Fuente: cargos y áreas facilitados por el propio Ayuntamiento (24/09/2026).
-- case_group tiene que coincidir EXACTAMENTE con los valores usados en
-- agent_instructions.
--
-- Decisiones tomadas al mapear cargos -> case_group:
-- - Juventud y Festejos: se usa a Bianca Martínez Asís (Responsable de
--   Juventud y Festejos), no al alcalde, aunque el alcalde también las
--   tenga en su cartera -- Bianca es el contacto operativo del día a día.
-- - Educación: se usa a María Hernández Rizo (Responsable de Educación),
--   no a Tomás Lorente, por el mismo motivo.
-- - Consumo se separa de Comercio como case_group propio (Dolores Sandoval
--   lleva Consumo; Tomás Lorente lleva Comercio -- son concejalías
--   distintas). Pendiente: retaguear a 'Consumo' la fila de OMIC en el CSV
--   de directorio, que hoy está como 'Comercio'.
-- - Contratación, Personal, Proyectos Europeos y Medio Ambiente: sin
--   contenido propio todavía en agent_instructions, pero se dejan ya
--   apuntando al alcalde (las lleva él) por si se necesitan en el futuro.

insert into escalation_contacts (agent_id, case_group, contact) values
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Urbanismo', 'jgarciabernabe@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Hacienda', 'jgarciabernabe@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Obras y Servicios', 'jgarciabernabe@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Contratación', 'jgarciabernabe@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Personal', 'jgarciabernabe@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Proyectos Europeos', 'jgarciabernabe@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Medio Ambiente', 'jgarciabernabe@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Seguridad Ciudadana', 'maria.segura@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Cultura y Turismo', 'maria.segura@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Igualdad', 'maria.segura@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Comercio', 'tomas.lorente@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Mayores', 'tomas.lorente@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Salud Pública', 'tomas.lorente@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Bienestar Animal', 'tomas.lorente@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Deportes', 'loli.sandoval@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Servicios Sociales', 'loli.sandoval@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Empleo y Formación', 'loli.sandoval@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Participación Ciudadana', 'loli.sandoval@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Consumo', 'loli.sandoval@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Juventud', 'biancamartinez@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Festejos', 'biancamartinez@alguazas.es'),
  ('c1330a20-c057-4764-8121-6268ca02f280', 'Educación', 'mariahernandez@alguazas.es')
on conflict (agent_id, case_group) do update set contact = excluded.contact;

-- Contacto genérico de respaldo (para case_group sin fila arriba: p. ej.
-- Transparencia, Sede electrónica, Gestión tributaria, Atención ciudadana,
-- Página principal, Corporación Municipal, Ordenanzas municipales), según
-- la regla general que dio el Ayuntamiento.
update agents
set escalation_contact = 'Regístralo en el Registro de entrada del Ayuntamiento (electrónico o presencial) o escribe a atencionalciudadano@alguazas.es'
where id = 'c1330a20-c057-4764-8121-6268ca02f280';
