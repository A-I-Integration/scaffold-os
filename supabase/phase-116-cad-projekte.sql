-- Phase 116: CAD-Projekte dauerhaft speichern (Konto statt nur Datei/Browser) + Verlauf der letzten Stände.
-- Im Supabase SQL Editor ausführen (einmal). Mehrfach ausführbar: legt nur an, wenn es fehlt, und verändert keine Daten.
-- Zugriff nur über die API (/api/cad/projekte, Service-Schlüssel, Rollen Admin/Disposition/Bauleiter); RLS ist an, es gibt
-- bewusst keine Policy – direkte Abfragen mit dem öffentlichen Schlüssel liefern nichts.
-- "daten" ist dieselbe Projektdatei wie "Projektdatei speichern" (Format scaffoldos-cad-projekt), serverseitig geprüft.
-- "revision" zählt bei jedem Speichern hoch: gespeichert wird nur, wenn die Person die aktuelle Revision kennt (kein stilles Überschreiben).
create table if not exists public.cad_projekte (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  daten jsonb not null,
  revision integer not null default 1 check (revision >= 1),
  erstellt_von uuid,
  geaendert_von uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cad_projekte_updated on public.cad_projekte (updated_at desc);
create index if not exists idx_cad_projekte_project on public.cad_projekte (project_id) where project_id is not null;
alter table public.cad_projekte enable row level security;

create table if not exists public.cad_projekt_staende (
  id uuid primary key default gen_random_uuid(),
  cad_projekt_id uuid not null references public.cad_projekte(id) on delete cascade,
  revision integer not null,
  name text not null,
  daten jsonb not null,
  gespeichert_von uuid,
  created_at timestamptz not null default now(),
  unique (cad_projekt_id, revision)
);
create index if not exists idx_cad_projekt_staende_projekt on public.cad_projekt_staende (cad_projekt_id, revision desc);
alter table public.cad_projekt_staende enable row level security;
