-- Rechnung: Kundentyp, USt-IdNr., Leitweg-ID, Steuerfall und unveränderbares Archiv der E-Rechnungs-Daten
-- Rein additiv, bestehende Daten bleiben unverändert. Vor dem Deploy der App ausführen.

-- 1. Kundenstamm
ALTER TABLE customers ADD COLUMN IF NOT EXISTS kundentyp text NOT NULL DEFAULT 'gewerblich';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ust_id text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS leitweg_id text;
DO $$ BEGIN
  ALTER TABLE customers ADD CONSTRAINT customers_kundentyp_check CHECK (kundentyp IN ('gewerblich', 'privat'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Rechnung: Stand zum Ausstellungszeitpunkt festhalten (GoBD)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS steuerfall text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_privat boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_ust_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS leitweg_id text;
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_steuerfall_check CHECK (steuerfall IS NULL OR steuerfall IN ('regel', '13b', 'kleinunternehmer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Archiv der strukturierten E-Rechnungs-Daten (XML im Originalformat, nur anfügen)
CREATE TABLE IF NOT EXISTS invoice_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  format text NOT NULL CHECK (format IN ('zugferd', 'xrechnung')),
  xml text NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (invoice_id, format, sha256)
);
CREATE INDEX IF NOT EXISTS invoice_archive_invoice_idx ON invoice_archive (invoice_id);

CREATE OR REPLACE FUNCTION invoice_archive_unveraenderbar() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'invoice_archive ist unveränderbar (GoBD): % nicht erlaubt', TG_OP;
END;
$$;
DROP TRIGGER IF EXISTS invoice_archive_kein_update ON invoice_archive;
CREATE TRIGGER invoice_archive_kein_update BEFORE UPDATE OR DELETE ON invoice_archive
  FOR EACH ROW EXECUTE FUNCTION invoice_archive_unveraenderbar();
DROP TRIGGER IF EXISTS invoice_archive_kein_truncate ON invoice_archive;
CREATE TRIGGER invoice_archive_kein_truncate BEFORE TRUNCATE ON invoice_archive
  FOR EACH STATEMENT EXECUTE FUNCTION invoice_archive_unveraenderbar();

ALTER TABLE invoice_archive ENABLE ROW LEVEL SECURITY;
-- Zugriff nur über den Server (Service-Rolle); keine Policy für Browser-Rollen.

-- Prüfung: alle neuen Spalten und die Tabelle müssen erscheinen
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'customers' AND column_name IN ('kundentyp', 'ust_id', 'leitweg_id'))
   OR (table_name = 'invoices' AND column_name IN ('steuerfall', 'customer_privat', 'customer_ust_id', 'leitweg_id'))
   OR table_name = 'invoice_archive'
ORDER BY table_name, column_name;
