-- Modo de respuesta por fila de agent_instructions.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- 'ia' (valor por defecto, comportamiento actual): la respuesta al
--      ciudadano la redacta Claude a partir de `instruction`.
-- 'directo': `instruction` YA ES el texto literal a enviar al ciudadano
--      (con el enlace incluido). El código (ver DIRECT_RESPONSE_THRESHOLD
--      en src/services/answer.js) lo envía tal cual, sin llamar nunca a la
--      API de Claude, siempre que la similitud de la búsqueda semántica
--      supere el umbral. Pensado para Transparencia, pero reutilizable
--      para cualquier caso futuro (de este ayuntamiento o de otro cliente)
--      que no necesite razonamiento de Claude.

-- 1. Columna nueva.
alter table agent_instructions
  add column if not exists response_mode text not null default 'ia';

-- 2. Hay que reflejar la columna nueva en la función de búsqueda semántica:
-- el código de la app necesita `response_mode` en el resultado para decidir
-- si evita a Claude. Sustituye a la función creada en
-- 2026-09-14_agent_instructions_embeddings.sql (mismo nombre, misma firma).
create or replace function match_agent_instructions(
  query_embedding vector(1024),
  p_agent_id uuid,
  match_count int
)
returns table (
  id uuid,
  case_group text,
  case_subgroup text,
  instruction text,
  associated_url text,
  allow_url_reading boolean,
  response_mode text,
  similarity float
)
language sql
stable
as $$
  select
    ai.id,
    ai.case_group,
    ai.case_subgroup,
    ai.instruction,
    ai.associated_url,
    ai.allow_url_reading,
    ai.response_mode,
    1 - (ai.embedding <=> query_embedding) as similarity
  from agent_instructions ai
  where ai.agent_id = p_agent_id
    and ai.active = true
    and ai.embedding is not null
  order by ai.embedding <=> query_embedding
  limit match_count;
$$;
