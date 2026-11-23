-- Phase 123: Versandprotokoll für Rechnungen und Mahnungen (Faktura F4) – rein additiv.
-- Vor dem Deploy der App im Supabase SQL-Editor ausführen.
--
-- Jeder Versandversuch (auch der fehlgeschlagene) bekommt eine Zeile: wer, wann, an wen, welches Format
-- (ZUGFeRD oder normale PDF), Prüfsumme des gesendeten Dokuments, Ergebnis und Fehlertext.
-- Die Tabelle ergänzt email_log (Mailverlauf mit Inhalt), ersetzt sie nicht. invoices.status bleibt unberührt.
-- Zugriff nur über den Server (Service-Key): RLS aktiv, bewusst ohne Policy für Browser-Sitzungen.

CREATE TABLE IF NOT EXISTS public.invoice_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'rechnung' CHECK (kind IN ('rechnung', 'mahnung')),
  to_email text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('versendet', 'fehlgeschlagen')),
  error text,
  format text CHECK (format IN ('zugferd', 'pdf')),
  dokument_hash text,
  attachment_name text,
  resend_id text,
  sent_by uuid
);
CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_invoice ON public.invoice_dispatches (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_number ON public.invoice_dispatches (invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_customer ON public.invoice_dispatches (customer_id, created_at DESC);
ALTER TABLE public.invoice_dispatches ENABLE ROW LEVEL SECURITY;

-- Prüfung: Tabelle muss erscheinen
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_dispatches';
