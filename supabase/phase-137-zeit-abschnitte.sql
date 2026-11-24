-- Phase 137: Tagesabschnitte der Zeiterfassung (Baustelle, Fahrt vom Hof, Pause, Schlechtwetter, Fortbildung)
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar)
--
-- Zugriff nur über die API-Route (Service Role Key) mit Rollenprüfung:
--   lesen: Chef, Disposition, Bauleiter · schreiben: Chef, Disposition.
-- RLS ist aktiv, bewusst OHNE Policy.

create table if not exists zeit_abschnitte (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  art text not null check (art in ('baustelle','fahrt_hof','pause','schlechtwetter','fortbildung')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  project_id uuid references projects(id) on delete set null,
  note text,
  quelle text not null default 'manuell' check (quelle in ('manuell','ortung')),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
alter table zeit_abschnitte enable row level security;
create index if not exists idx_zeit_abschnitte_tag on zeit_abschnitte(work_date, employee_id);
