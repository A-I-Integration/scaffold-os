-- Rechnungsprüfung durch den Auftraggeber (Prüflink ohne Login)
-- Rein additiv. Vor dem Deploy der App im Supabase SQL-Editor ausführen.
-- Zugriff nur über den Server (Service-Rolle), wie bei project_view_links.

CREATE TABLE IF NOT EXISTS public.invoice_pruef_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_invoice_pruef_links_invoice ON public.invoice_pruef_links (invoice_id);
ALTER TABLE public.invoice_pruef_links ENABLE ROW LEVEL SECURITY;

-- Jede Entscheidung bleibt als Verlauf erhalten (nichts wird überschrieben).
CREATE TABLE IF NOT EXISTS public.invoice_pruefungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.invoice_pruef_links(id) ON DELETE SET NULL,
  entscheidung text NOT NULL CHECK (entscheidung IN ('akzeptiert', 'aenderung', 'abgelehnt')),
  geprueft_von text NOT NULL,
  kommentar text,
  geprueft_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_pruefungen_invoice ON public.invoice_pruefungen (invoice_id, geprueft_am DESC);
ALTER TABLE public.invoice_pruefungen ENABLE ROW LEVEL SECURITY;

-- Letzter Stand direkt an der Rechnung (für die Liste)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pruef_status text
  CHECK (pruef_status IS NULL OR pruef_status IN ('akzeptiert', 'aenderung', 'abgelehnt'));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS geprueft_von text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS geprueft_am timestamptz;

-- Prüfung: alle drei Zeilen müssen erscheinen
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('invoice_pruef_links', 'invoice_pruefungen');
SELECT column_name FROM information_schema.columns
WHERE table_name = 'invoices' AND column_name IN ('pruef_status', 'geprueft_von', 'geprueft_am');
