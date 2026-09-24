-- Contactos de derivación a humano por departamento/concejalía.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- Complementa a agents.escalation_contact (contacto genérico: se mantiene
-- tal cual, para cuando NO se identifica ninguna concejalía). Esta tabla
-- nueva permite un contacto distinto por case_group, usando exactamente
-- las mismas categorías que ya se usan en agent_instructions -- es la
-- clave que las conecta.
--
-- Una fila por agente + concejalía (agent_id, case_group es único), así
-- que también sirve tal cual para otros clientes del mismo Núcleo, no
-- solo para Alguazas.

create table if not exists escalation_contacts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  case_group text not null,
  contact text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (agent_id, case_group)
);

-- GRANT explícito: en este proyecto el rol service_role no tiene privilegios
-- por defecto sobre tablas nuevas (ya pasó con agent_instructions y con
-- page_cache), así que se concede aquí directamente para evitar el mismo
-- error de permisos.
grant select, insert, update, delete on escalation_contacts to service_role;

-- Ejemplo de cómo rellenarla (sustituye por los contactos reales de cada
-- concejalía; case_group tiene que escribirse EXACTAMENTE igual que en
-- agent_instructions, si no, no habrá coincidencia):
--
-- insert into escalation_contacts (agent_id, case_group, contact) values
--   ('c1330a20-c057-4764-8121-6268ca02f280', 'Urbanismo', '968 XX XX XX'),
--   ('c1330a20-c057-4764-8121-6268ca02f280', 'Deportes', '968 XX XX XX')
-- on conflict (agent_id, case_group) do update set contact = excluded.contact;
