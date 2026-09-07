-- ============================================================
-- Phase 38: Teilzahlungen (Punkt 6 der Faktura-Recherche-Liste)
--
-- Bisher war eine Rechnung nur "offen" oder "bezahlt" (binär). Zahlt
-- ein Kunde nur einen Teilbetrag, gab es dafür keine Abbildung.
--
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor
-- ausführen.
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN invoices.paid_amount IS
  'Bisher eingegangener Betrag (Summe aller Teilzahlungen). status bleibt "offen", solange paid_amount < gross_amount; "bezahlt" erst bei vollständigem Ausgleich.';

-- Zahlungshistorie: jede einzelne (Teil-)Zahlung als eigener Eintrag,
-- statt nur einen Gesamtbetrag zu überschreiben – nachvollziehbar, wann
-- wie viel einging.
CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT current_date,
  note text
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);

COMMENT ON TABLE invoice_payments IS
  'Zahlungshistorie je Rechnung – ermöglicht mehrere Teilzahlungen nachvollziehbar zu erfassen.';
