-- Phase 145: Zeit-Knöpfe für Mitarbeiter (Vom Hof gefahren, Auf der Baustelle, Pause, Fahrt zum Hof, Stoppen)
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar). Voraussetzung: phase-137-zeit-abschnitte.sql
--
-- 1. Neue Art „Fahrt zum Hof“ und neue Quellen „knopf“ (per Knopf erfasst) und „mitarbeiter“ (vom Mitarbeiter nachgetragen).
-- 2. zeit_lauf: der gerade laufende Abschnitt je Mitarbeiter (höchstens einer). Beim Wechsel oder Stoppen wird er als fertiger
--    Abschnitt in zeit_abschnitte übernommen. Die gebuchten Stunden (time_entries) bleiben unberührt.
-- Zugriff nur über die API-Route (Service Role Key). RLS ist aktiv, bewusst OHNE Policy.

alter table zeit_abschnitte drop constraint if exists zeit_abschnitte_art_check;
alter table zeit_abschnitte add constraint zeit_abschnitte_art_check
  check (art in ('baustelle','fahrt_hof','fahrt_zum_hof','pause','schlechtwetter','fortbildung'));

alter table zeit_abschnitte drop constraint if exists zeit_abschnitte_quelle_check;
alter table zeit_abschnitte add constraint zeit_abschnitte_quelle_check
  check (quelle in ('manuell','ortung','knopf','mitarbeiter'));

create table if not exists zeit_lauf (
  employee_id uuid primary key references employees(id) on delete cascade,
  art text not null check (art in ('baustelle','fahrt_hof','fahrt_zum_hof','pause','schlechtwetter','fortbildung')),
  start_time timestamptz not null,
  project_id uuid references projects(id) on delete set null,
  davor_art text check (davor_art is null or davor_art in ('baustelle','fahrt_hof','fahrt_zum_hof')),
  created_at timestamptz not null default now()
);
alter table zeit_lauf enable row level security;
