-- Phase 112: Materialmanager – Bauabschnitte der Stückliste (Verladeliste je Abschnitt)
-- Eigene kleine Tabelle statt projects.data: kein Überschreiben fremder Änderungen am Projekt, keine unnötigen Projektversionen.
-- Zugriff nur über die API (Service-Schlüssel); RLS ist an, es gibt bewusst keine Policy.
-- Mehrfach ausführbar.
create table if not exists public.material_abschnitte (
  project_id uuid primary key references public.projects(id) on delete cascade,
  abschnitte jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.material_abschnitte enable row level security;
