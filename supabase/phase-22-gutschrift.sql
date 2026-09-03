-- ============================================================
-- Phase 22: Gutschrift als eigener Beleg-Typ mit eigener
-- laufender Nummer (GS-JAHR-NNNN statt RE-JAHR-NNNN)
--
-- Verändert KEINE bestehende Zeile/Nummer. Additiv:
--   1) invoice_counters bekommt eine "prefix"-Spalte (Standard 'RE'
--      für alle bestehenden Zähler) und einen zusammengesetzten
--      Primärschlüssel (year, prefix) – dadurch läuft "GS" als
--      eigener, unabhängiger Zähler neben "RE".
--   2) next_invoice_number() bekommt einen optionalen Parameter
--      p_prefix (Standard 'RE') – bestehende Aufrufe ohne
--      Parameter verhalten sich unverändert.
--   3) invoices.invoice_type darf jetzt zusätzlich 'gutschrift' sein.
--   4) invoices.reference_invoice_number (optional) – auf welche
--      Rechnung sich die Gutschrift bezieht, rein informativ.
--
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

ALTER TABLE invoice_counters ADD COLUMN IF NOT EXISTS prefix text NOT NULL DEFAULT 'RE';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_counters_pkey'
  ) THEN
    ALTER TABLE invoice_counters DROP CONSTRAINT invoice_counters_pkey;
  END IF;
  ALTER TABLE invoice_counters ADD PRIMARY KEY (year, prefix);
END $$;

CREATE OR REPLACE FUNCTION next_invoice_number(p_prefix text DEFAULT 'RE')
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  y int := extract(year from current_date)::int;
  n int;
BEGIN
  INSERT INTO invoice_counters (year, prefix, last_number)
  VALUES (y, p_prefix, 1)
  ON CONFLICT (year, prefix)
  DO UPDATE SET last_number = invoice_counters.last_number + 1
  RETURNING last_number INTO n;

  RETURN p_prefix || '-' || y || '-' || lpad(n::text, 4, '0');
END;
$$;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference_invoice_number text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_type_check') THEN
    ALTER TABLE invoices DROP CONSTRAINT invoices_invoice_type_check;
  END IF;
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_invoice_type_check
    CHECK (invoice_type IN ('standard', 'abschlag', 'schluss', 'gutschrift'));
END $$;

COMMENT ON COLUMN invoices.reference_invoice_number IS
  'Nur bei invoice_type = gutschrift: Rechnungsnummer, auf die sich die Gutschrift bezieht (informativ, keine FK).';
