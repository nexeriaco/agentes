create table if not exists public.conversation_state (
  agent_id uuid not null references public.agents(id) on delete cascade,
  chat_id text not null,
  source_kind text,
  source_id uuid,
  entity_label text,
  context_text text,
  intent text,
  pending_options jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (agent_id, chat_id),
  constraint conversation_state_source_kind_check
    check (source_kind is null or source_kind in ('instruction', 'event'))
);

create index if not exists conversation_state_updated_at_idx
  on public.conversation_state (updated_at);

alter table public.conversation_state enable row level security;

grant select, insert, update, delete
on table public.conversation_state
to service_role;
