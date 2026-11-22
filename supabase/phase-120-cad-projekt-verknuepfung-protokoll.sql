-- Phase 120: Jede Verknüpfung eines CAD-Projekts mit einem Kundenprojekt wird unveränderbar protokolliert.
-- Voraussetzung: phase-116 bis phase-119 sind ausgeführt.
--  * Ein Trigger schreibt bei jeder Änderung von cad_projekte.project_id (auch beim Anlegen) alte und neue Verknüpfung, Benutzer und Zeitpunkt.
--    Weil er in der Datenbank sitzt, kann keine Anwendungsroute die Protokollierung vergessen oder umgehen.
--  * Das Protokoll ist unveränderbar (kein Ändern, Löschen, Leeren) und hängt nicht per Fremdschlüssel am Projekt.

create table if not exists public.cad_projekt_verknuepfung_log (
  id uuid primary key default gen_random_uuid(),
  cad_projekt_id uuid not null,
  alt_project_id uuid,
  neu_project_id uuid,
  geaendert_von uuid,
  created_at timestamptz not null default now()
);
alter table public.cad_projekt_verknuepfung_log enable row level security;
create index if not exists idx_cad_verknuepfung_log_projekt on public.cad_projekt_verknuepfung_log (cad_projekt_id, created_at);

drop trigger if exists trg_cad_verknuepfung_log_unveraenderbar on public.cad_projekt_verknuepfung_log;
create trigger trg_cad_verknuepfung_log_unveraenderbar before update or delete on public.cad_projekt_verknuepfung_log for each row execute function public.cad_protokoll_unveraenderbar();
drop trigger if exists trg_cad_verknuepfung_log_leeren on public.cad_projekt_verknuepfung_log;
create trigger trg_cad_verknuepfung_log_leeren before truncate on public.cad_projekt_verknuepfung_log for each statement execute function public.cad_protokoll_unveraenderbar();

create or replace function public.cad_verknuepfung_protokollieren() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.project_id is not null then
      insert into public.cad_projekt_verknuepfung_log (cad_projekt_id, alt_project_id, neu_project_id, geaendert_von) values (new.id, null, new.project_id, new.geaendert_von);
    end if;
  elsif new.project_id is distinct from old.project_id then
    insert into public.cad_projekt_verknuepfung_log (cad_projekt_id, alt_project_id, neu_project_id, geaendert_von) values (new.id, old.project_id, new.project_id, new.geaendert_von);
  end if;
  return new;
end $$;
drop trigger if exists trg_cad_verknuepfung_protokollieren on public.cad_projekte;
create trigger trg_cad_verknuepfung_protokollieren after insert or update of project_id on public.cad_projekte for each row execute function public.cad_verknuepfung_protokollieren();
