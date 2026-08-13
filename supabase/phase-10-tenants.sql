-- ============================================================
-- SCAFFOLD OS – PHASE 10: Mandanten-Registry (Kunden-Setup-Paket)
-- In der MASTER-Datenbank ausführen (eure jetzige Supabase-Instanz,
-- NICHT in Kunden-Projekten!).
-- SQL Editor → New query → einfügen → Run
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- INHALT:
-- 1) Tabelle public.tenants: eine Zeile pro Kunden-Installation
--    (Subdomain, Supabase-Projekt, Vercel-Projekt, Status)
-- 2) RLS an, KEINE Policies: nur der service_role-Key
--    (also ausschließlich eure API-Routen) darf lesen/schreiben.
--
-- A-READY: Die Felder supabase_url / supabase_anon_key /
-- supabase_service_role_key sind genau die, die ein späterer
-- Multi-Tenant-Umbau (Weg A) zur Laufzeit-Auflösung braucht.
--
-- Es wird NICHTS gelöscht und NICHTS überschrieben.
-- ============================================================

create table if not exists public.tenants (
  id                      uuid primary key default gen_random_uuid(),

  -- Kunden-Kennung
  slug                    text not null unique,        -- "muster-bau" → muster-bau.scaffoldos.de
  company_name            text not null,
  admin_email             text not null,
  admin_name              text,

  -- Provisionierungs-Status
  status                  text not null default 'provisioning',  -- provisioning | active | error | cancelled
  provision_step          text,                        -- letzter ERFOLGREICHER Schritt
  provision_log           jsonb not null default '[]'::jsonb,    -- [{ts, step, msg}]
  error_message           text,

  -- Supabase des Kunden (eigenes Projekt, Region Frankfurt)
  supabase_project_ref    text,
  supabase_url            text,
  supabase_anon_key       text,
  supabase_service_role_key text,

  -- Vercel des Kunden (eigenes Deployment)
  vercel_project_id       text,
  subdomain               text,                        -- voller Hostname, z. B. muster-bau.scaffoldos.de

  -- Abo / Abrechnung (Stripe später: stripe_customer_id etc. hier ergänzen)
  plan                    text not null default 'pilot-249',

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Nur Service-Role-Zugriff (unsere API-Routen). Keine anon/authenticated-Policies!
alter table public.tenants enable row level security;

-- Hilfs-Index für Statusabfragen im Admin
create index if not exists tenants_status_idx on public.tenants (status);
