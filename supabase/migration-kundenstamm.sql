-- ============================================================
-- MIGRATION: Kundenstamm-Tabelle (customers)
-- ============================================================
-- EINMALIG pro BESTEHENDER Instanz ausführen (Demo + Pilot-Kunde)
-- im Supabase SQL-Editor. Neue Kunden bekommen die Tabelle
-- automatisch über kunden-schema.sql (Phase 18).
-- Idempotent: mehrfach ausführen ist unkritisch.
-- ============================================================
-- PHASE 18: Kundenstamm (CSV-Import / Wechsler)
-- ============================================================
-- Eigene Kundentabelle, damit Stammdaten aus Altsoftware
-- (CP-PRO, WinWorker, Excel) übernommen und wiederverwendet
-- werden können.
CREATE TABLE IF NOT EXISTS public.customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  name           text NOT NULL,
  contact_person text,
  email          text,
  phone          text,
  street         text,
  zip            text,
  city           text,
  notes          text,
  is_active      boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_authenticated_all" ON public.customers;
CREATE POLICY "customers_authenticated_all" ON public.customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
