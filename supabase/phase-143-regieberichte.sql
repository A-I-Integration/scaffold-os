-- Phase 143: Regie-/Rapportberichte (Stunden, Material, Fotos, Unterschrift, Übernahme in die Rechnung)
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar).
create table if not exists regieberichte (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nummer text not null unique,                       -- RB-2026-0001
  project_id uuid not null,
  customer_id uuid,
  datum date not null default current_date,
  anlass text,
  beschreibung text,
  stunden jsonb not null default '[]'::jsonb,        -- [{ name, stunden, satz }]
  material jsonb not null default '[]'::jsonb,       -- [{ bezeichnung, menge, einheit, einzelpreis }]
  fotos jsonb not null default '[]'::jsonb,          -- [Bild als data-URL]
  status text not null default 'entwurf',            -- entwurf | unterschrieben | versendet | zurueck
  unterschrieben_von text,
  unterschrift text,                                 -- PNG als data-URL
  unterschrieben_am timestamptz,
  versendet_an text,
  versendet_am timestamptz,
  zurueck_am timestamptz,                            -- unterschriebener Rücklauf eingegangen
  rechnung_id uuid,
  rechnung_nummer text,
  abgerechnet_am timestamptz,
  erstellt_von uuid
);
create index if not exists regieberichte_project_idx on regieberichte (project_id);
create index if not exists regieberichte_rechnung_idx on regieberichte (rechnung_id);
-- Zugriff nur über die App (Service-Rolle); Unterschriften und Fotos sind personenbezogen
alter table regieberichte enable row level security;
