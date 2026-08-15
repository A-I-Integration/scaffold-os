-- ============================================================
-- SCAFFOLD OS – PHASE 15: Produkt-Lücken (Mahnungen + Rechnungstypen)
-- In Supabase ausführen: SQL Editor → New query → einfügen → Run
-- Idempotent: kann mehrfach ausgeführt werden (IF NOT EXISTS).
--
-- NEU an invoices:
--   • reminder_level int (0 = keine, 1 = 1. Mahnung, 2 = 2. Mahnung)
--   • invoice_type text ('standard' | 'abschlag' | 'schluss')
--
-- WICHTIG: Diese SQL auch in supabase/kunden-schema.sql
-- einfügen, damit NEUE Kundeninstanzen sie bekommen.
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_level int NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_type_check'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_invoice_type_check
      CHECK (invoice_type IN ('standard', 'abschlag', 'schluss'));
  END IF;
END $$;
