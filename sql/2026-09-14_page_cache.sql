-- Caché de contenido de páginas/PDFs leídos en vivo por la tool buscar_url,
-- más el tiempo de validez configurable por fila de agent_instructions.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- 1. Tiempo de validez de caché por fila (en horas). NULL = usar el
-- valor por defecto (4h) que aplica la propia aplicación.
alter table agent_instructions
  add column if not exists horas_cache_pagina integer;

-- Excepción: el contenido de Farmacias de guardia es una imagen/calendario
-- que el ayuntamiento publica una vez al año, así que no hace falta
-- refrescarla cada pocas horas.
update agent_instructions
set horas_cache_pagina = 720
where case_group = 'Salud Pública' and case_subgroup = 'Farmacias de guardia';

-- 2. Tabla de caché: una fila por URL, se sobrescribe en cada refresco
-- (no es un histórico que crezca sin límite).
create table if not exists page_cache (
  url text primary key,
  content jsonb not null,
  fecha_consulta timestamptz not null default now()
);

-- GRANT explícito: en este proyecto el rol service_role no tiene privilegios
-- por defecto sobre tablas nuevas (ya nos pasó con agent_instructions), así
-- que se concede aquí directamente para evitar el mismo error de permisos.
grant select, insert, update, delete on page_cache to service_role;
