-- Phase 117: CAD-Projekte bekommen Kunde (Verknüpfung zur Kundenverwaltung), Projektnummer und Projektstatus.
-- Im Supabase SQL Editor ausführen (einmal), BEVOR der neue Code live geht. Mehrfach ausführbar, verändert keine bestehenden Daten außer
-- dem Nachtragen der Projektnummer bei vorhandenen CAD-Projekten.
--  * customer_id: eindeutige Verknüpfung zum Kundenstamm (public.customers). Name und Anschrift kommen immer aus dem Stammdatensatz.
--  * projektnummer: wird beim Anlegen automatisch vergeben (CAD-JJJJ-NNNN), eindeutig (ohne Beachtung der Groß-/Kleinschreibung).
--    Manuelle Änderungen erlaubt die API nur Admins; jede Änderung wird von der Datenbank selbst in cad_projektnummer_log protokolliert.
--  * status: Entwurf, In Bearbeitung, Prüfung erforderlich, Freigegeben, Abgeschlossen, Archiviert. Wird nie automatisch gesetzt.

alter table public.cad_projekte add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.cad_projekte add column if not exists projektnummer text;
alter table public.cad_projekte add column if not exists status text not null default 'entwurf';

do $$ begin
  alter table public.cad_projekte add constraint cad_projekte_status_check
    check (status in ('entwurf','in_bearbeitung','pruefung_erforderlich','freigegeben','abgeschlossen','archiviert'));
exception when duplicate_object then null; end $$;

create sequence if not exists public.cad_projektnummer_seq;

create or replace function public.cad_projektnummer_vergeben() returns trigger language plpgsql as $$
begin
  if new.projektnummer is null or btrim(new.projektnummer) = '' then
    new.projektnummer := 'CAD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.cad_projektnummer_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_cad_projektnummer_vergeben on public.cad_projekte;
create trigger trg_cad_projektnummer_vergeben before insert on public.cad_projekte
  for each row execute function public.cad_projektnummer_vergeben();

-- Bestehende Projekte ohne Nummer nachtragen (älteste zuerst)
with n as (
  select id, created_at, row_number() over (order by created_at, id) as rn from public.cad_projekte where projektnummer is null
)
update public.cad_projekte c
   set projektnummer = 'CAD-' || to_char(n.created_at, 'YYYY') || '-' || lpad(nextval('public.cad_projektnummer_seq')::text, 4, '0')
  from n where c.id = n.id;

alter table public.cad_projekte alter column projektnummer set not null;
create unique index if not exists cad_projekte_projektnummer_uq on public.cad_projekte (upper(projektnummer));
create index if not exists idx_cad_projekte_customer on public.cad_projekte (customer_id) where customer_id is not null;

-- Protokoll jeder Änderung der Projektnummer (von der Datenbank geschrieben, nicht von der Oberfläche)
create table if not exists public.cad_projektnummer_log (
  id uuid primary key default gen_random_uuid(),
  cad_projekt_id uuid not null references public.cad_projekte(id) on delete cascade,
  alt text,
  neu text not null,
  geaendert_von uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_cad_projektnummer_log_projekt on public.cad_projektnummer_log (cad_projekt_id, created_at desc);
alter table public.cad_projektnummer_log enable row level security;

create or replace function public.cad_projektnummer_protokoll() returns trigger language plpgsql as $$
begin
  if old.projektnummer is distinct from new.projektnummer then
    insert into public.cad_projektnummer_log (cad_projekt_id, alt, neu, geaendert_von) values (new.id, old.projektnummer, new.projektnummer, new.geaendert_von);
  end if;
  return new;
end $$;

drop trigger if exists trg_cad_projektnummer_protokoll on public.cad_projekte;
create trigger trg_cad_projektnummer_protokoll after update of projektnummer on public.cad_projekte
  for each row execute function public.cad_projektnummer_protokoll();
