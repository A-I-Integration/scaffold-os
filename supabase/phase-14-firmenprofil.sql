-- ============================================================
-- SCAFFOLD OS – PHASE 14: Firmenprofil (Unternehmensdaten)
-- In Supabase ausführen: SQL Editor → New query → einfügen → Run
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- NEU:
--   1) Tabelle company_settings – EINE Zeile pro Instanz
--      (Firmenname, Adresse, Steuer-Nr./USt-IdNr., Bank, Depot)
--   2) Rechnungen speichern ein Firmen-Snapshot (GoBD: die
--      Rechnung muss die damaligen Firmendaten zeigen)
--
-- Verwendet von:
--   • /einstellungen (Firmenprofil bearbeiten, nur Admin)
--   • /rechnungen (PDF-Fußzeile § 14 UStG aus company_snapshot)
--   • /routenoptimierung (Depot = Startpunkt der Touren)
--
-- WICHTIG: Diese SQL auch in supabase/kunden-schema.sql
-- einfügen, damit NEUE Kundeninstanzen sie bekommen.
-- ============================================================

-- ─── Firmenprofil (Singleton: genau eine Zeile) ───
CREATE TABLE IF NOT EXISTS company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  company_name text,
  street text,
  zip text,
  city text,
  phone text,
  email text,
  website text,
  steuer_nr text,
  ust_id text,
  bank_name text,
  iban text,
  bic text,
  depot_address text
);

-- Leere Startzeile anlegen (feste ID = Singleton)
INSERT INTO company_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─── RLS (Stil wie üblich: authenticated_all) ───
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_settings_authenticated_all" ON company_settings;
CREATE POLICY "company_settings_authenticated_all" ON company_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Firmen-Snapshot auf Rechnungen (GoBD) ───
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_snapshot jsonb;
