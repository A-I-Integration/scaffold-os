-- ============================================================
-- SCAFFOLD OS – phase-105: Protokoll der eingespielten SQL-Dateien
-- ============================================================
-- Zweck: Je Instanz festhalten, welche SQL-Dateien schon gelaufen sind.
-- Neue SQL-Dateien tragen sich am Ende selbst ein, zum Beispiel:
--     insert into public.schema_migrationen (name) values ('phase-106-beispiel')
--       on conflict (name) do nothing;
-- Idempotent: darf mehrfach laufen. Ändert keine bestehenden Daten.
-- Zugriff: nur über den Service-Role-Schlüssel (RLS an, keine Policies).
-- ============================================================

create table if not exists public.schema_migrationen (
  name          text primary key,
  angewendet_am timestamptz not null default now(),
  bemerkung     text
);

alter table public.schema_migrationen enable row level security;

comment on table public.schema_migrationen is
  'Protokoll, welche SQL-Dateien aus supabase/ in dieser Instanz eingespielt wurden (Name ohne .sql).';

insert into public.schema_migrationen (name, bemerkung)
values ('phase-105-schema-migrationen', 'Protokoll-Tabelle angelegt')
on conflict (name) do nothing;
