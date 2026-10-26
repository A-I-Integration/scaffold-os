-- Anhänge an Rechnungen (Bilder, PDFs, Excel, E-Mails) – rein additiv.
-- Vor dem Deploy der App im Supabase SQL-Editor ausführen.
-- Dateien liegen in einem PRIVATEN Bucket; Zugriff nur über den Server (signierte, kurzlebige Links).

INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-attachments', 'invoice-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  bestaetigt_am timestamptz
);
CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice ON public.invoice_attachments (invoice_id, created_at);
ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

-- Prüfung: Tabelle und Bucket müssen erscheinen
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_attachments';
SELECT id, public FROM storage.buckets WHERE id = 'invoice-attachments';
