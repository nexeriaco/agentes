-- Búsqueda semántica sobre agent_instructions con pgvector + Voyage AI
-- (modelo voyage-4-lite, 1024 dimensiones).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

-- 1. Extensión pgvector
create extension if not exists vector;

-- 2. Columna de embedding
alter table agent_instructions
  add column if not exists embedding vector(1024);

-- 3. Índice ivfflat para similitud coseno.
-- Con el volumen actual (~100 filas) un índice ivfflat no aporta nada
-- (postgres hará table scan igualmente) e incluso puede degradar el
-- recall si se crea con pocas filas, pero lo dejamos preparado para
-- cuando la tabla crezca. `lists = 100` es razonable hasta unas
-- ~100k filas; si la tabla crece mucho más, conviene recrear el índice
-- con un `lists` mayor (regla habitual: sqrt(nº de filas)).
create index if not exists agent_instructions_embedding_idx
  on agent_instructions
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. RPC: instrucciones de un agente más similares a un embedding de consulta.
-- Devuelve también `similarity` (1 - distancia coseno, en [-1, 1] pero en la
-- práctica ~[0, 1] para embeddings normalizados) para poder aplicar un
-- umbral mínimo en la capa de aplicación.
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
    1 - (ai.embedding <=> query_embedding) as similarity
  from agent_instructions ai
  where ai.agent_id = p_agent_id
    and ai.active = true
    and ai.embedding is not null
  order by ai.embedding <=> query_embedding
  limit match_count;
$$;
