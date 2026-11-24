-- Phase 136: Betriebskalender (zusätzliche freie Tage und Betriebsferien für alle Mitarbeiter)
-- Einmalig im Supabase SQL-Editor ausführen (idempotent). RLS aktiv, bewusst OHNE Policy: Zugriff nur über die API.
create table if not exists betriebskalender (
  id uuid primary key default gen_random_uuid(),
  art text not null check (art in ('feiertag','betriebsferien')),
  bezeichnung text not null,
  von date not null,
  bis date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (bis >= von)
);
alter table betriebskalender enable row level security;
create index if not exists idx_betriebskalender_von on betriebskalender(von);
