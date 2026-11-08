-- ============================================================
-- SCAFFOLD OS – Wechsel-Import (Datenübernahme aus Altsoftware wie CP-PRO)
-- Ausführen im Supabase SQL-Editor. Mehrfaches Ausführen ist unbedenklich.
--
--  1) alt_nummer: Kundennummer bzw. Projektnummer aus der Altsoftware.
--     Damit werden Baustellen und Rechnungen sicher dem richtigen Kunden zugeordnet
--     (nicht nur über den Namen) und ein zweiter Import legt nichts doppelt an.
--  2) import_protokolle: Nachweis jedes Imports (Datei, Anzahl, Fehler, Hinweise).
-- ============================================================

alter table public.customers add column if not exists alt_nummer text;
alter table public.projects  add column if not exists alt_nummer text;

create index if not exists customers_alt_nummer_idx on public.customers (alt_nummer) where alt_nummer is not null;
create index if not exists projects_alt_nummer_idx  on public.projects  (alt_nummer) where alt_nummer is not null;

create table if not exists public.import_protokolle (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  art           text not null,            -- kunden | baustellen | rechnungen | material
  quelle        text,                     -- z. B. CP-PRO, WinWorker, Excel
  dateiname     text,
  angelegt_von  uuid,
  gesamt        integer not null default 0,
  importiert    integer not null default 0,
  uebersprungen integer not null default 0,
  fehler        jsonb not null default '[]'::jsonb,
  hinweise      jsonb not null default '[]'::jsonb
);

create index if not exists import_protokolle_created_idx on public.import_protokolle (created_at desc);

-- Zugriff nur über die Server-Routen (Service-Rolle); direkte Zugriffe aus dem Browser sind gesperrt.
alter table public.import_protokolle enable row level security;
