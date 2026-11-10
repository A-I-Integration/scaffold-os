-- Phase 115: Statik-Dokumente – Unterlagen und Freigabe-Schritte je Projekt (Büro und Statiker)
-- Dateien liegen im bestehenden Bucket project-media (Unterordner projects/<Projekt>/statik/).
-- Zugriff nur über die API (Service-Schlüssel); RLS ist an, es gibt bewusst keine Policy. Mehrfach ausführbar.
create table if not exists public.statik_dokumente (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  art text not null check (art in ('entwurfsplan','entwurfsstatik','bestandsplan','ausfuehrungsplan','berechnung','montageanweisung','konformitaet','bescheinigung','verankerungsprotokoll','sonstiges')),
  file_name text not null,
  storage_path text not null,
  file_type text,
  groesse_bytes bigint,
  notiz text,
  hochgeladen_von uuid,
  hochgeladen_von_rolle text not null check (hochgeladen_von_rolle in ('buero','statiker')),
  created_at timestamptz not null default now()
);
create index if not exists idx_statik_dokumente_projekt on public.statik_dokumente (project_id, created_at desc);
alter table public.statik_dokumente enable row level security;

create table if not exists public.statik_status (
  project_id uuid primary key references public.projects(id) on delete cascade,
  montagebeginn date,
  eingereicht_am date,
  freigegeben_am date,
  konformitaet_am date,
  bescheinigung_am date,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.statik_status enable row level security;
