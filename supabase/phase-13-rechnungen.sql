-- ============================================================
-- SCAFFOLD OS – PHASE 13: Rechnungsmodul
-- In Supabase ausführen: SQL Editor → New query → einfügen → Run
-- Idempotent: kann mehrfach ausgeführt werden (IF NOT EXISTS).
--
-- NEU:
--   1) Tabelle invoices – Rechnungen mit §14-UStG-Pflichtangaben
--   2) Tabelle invoice_counters + Funktion next_invoice_number()
--      → fortlaufende Rechnungsnummern pro Jahr (RE-2026-0001 …),
--        über REST aufrufbar: POST /rest/v1/rpc/next_invoice_number
--   3) RLS-Policy im gleichen Stil wie die übrigen Tabellen
--      (authenticated_all)
--
-- WICHTIG für die Master-Instanz:
--   Diese SQL muss auch in supabase/kunden-schema.sql eingefügt
--   werden, damit NEUE Kundeninstanzen das Rechnungsmodul haben.
-- ============================================================

-- ─── Rechnungsnummern-Zähler (pro Jahr fortlaufend) ───
CREATE TABLE IF NOT EXISTS invoice_counters (
  year int PRIMARY KEY,
  last_number int NOT NULL DEFAULT 0
);

-- ─── Funktion: nächste Rechnungsnummer (RE-JAHR-LAUFNUMMER) ───
CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  y int := extract(year from current_date)::int;
  n int;
BEGIN
  INSERT INTO invoice_counters (year, last_number)
  VALUES (y, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_number = invoice_counters.last_number + 1
  RETURNING last_number INTO n;

  RETURN 'RE-' || y || '-' || lpad(n::text, 4, '0');
END;
$$;

-- ─── Rechnungen ───
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  invoice_number text NOT NULL UNIQUE,
  project_id uuid REFERENCES projects(id),
  customer_name text NOT NULL,
  customer_address text,
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 19,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen', 'bezahlt', 'ueberfaellig', 'storniert')),
  invoice_date date NOT NULL DEFAULT current_date,
  due_date date,
  notes text
);

-- ─── Indizes ───
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);
CREATE INDEX IF NOT EXISTS invoices_project_idx ON invoices (project_id);
CREATE INDEX IF NOT EXISTS invoices_date_idx ON invoices (invoice_date);

-- ─── Row Level Security (Stil wie Phase 4: authenticated_all) ───
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_authenticated_all" ON invoices;
CREATE POLICY "invoices_authenticated_all" ON invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
