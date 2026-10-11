-- ============================================================
-- Phase 99: Mails eindeutig dem Kunden zuordnen (email_log)
--
-- Neue Spalten customer_id / sent_by / sent_from, neuer Mail-Typ 'frei'
-- (freie Mail ohne Dokument) und eine vorsichtige Nachtragung bestehender
-- Mails (nur wo über Projekt bzw. Rechnungsnummer eindeutig).
-- Mehrfach ausführbar. Einmalig im Supabase Dashboard -> SQL Editor.
-- (Wurde am 11.10.2026 bereits so ausgeführt.)
-- ============================================================

ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_by     uuid REFERENCES auth.users(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_from   text;

CREATE INDEX IF NOT EXISTS idx_email_log_customer
  ON public.email_log (customer_id, sent_at DESC);

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.email_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%angebot%'
  LOOP
    EXECUTE format('ALTER TABLE public.email_log DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE public.email_log
    ADD CONSTRAINT email_log_type_check
    CHECK (type IN ('angebot', 'rechnung', 'mahnung', 'frei'));
END $$;

UPDATE public.email_log e
SET customer_id = p.customer_id
FROM public.projects p
WHERE e.customer_id IS NULL
  AND e.project_id = p.id
  AND p.customer_id IS NOT NULL;

UPDATE public.email_log e
SET customer_id = i.customer_id
FROM public.invoices i
WHERE e.customer_id IS NULL
  AND e.invoice_number = i.invoice_number
  AND i.customer_id IS NOT NULL;

COMMENT ON COLUMN public.email_log.customer_id IS 'Kunde, zu dem die Mail gehört (Anzeige im Kunden-Reiter E-Mails).';
COMMENT ON COLUMN public.email_log.sent_by     IS 'Nutzer, der die Mail ausgelöst hat.';
COMMENT ON COLUMN public.email_log.sent_from   IS 'Absender-Adresse bzw. Weg (z. B. Resend oder eigenes Postfach).';
