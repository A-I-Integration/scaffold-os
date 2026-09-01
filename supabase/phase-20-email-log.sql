-- ============================================================
-- Phase 20: E-Mail-Verlauf (ausgehende Mails protokollieren)
--
-- Protokolliert jede über /api/email versendete Mail (Angebot,
-- Rechnung, Mahnung, Zusatzrechnung), damit sie im Kunden-Reiter
-- pro Auftrag als Verlauf sichtbar ist.
--
-- WICHTIG (Grenze dieser Tabelle): Das ist nur der ausgehende
-- Versand. Eingehende Antworten des Kunden (echter "hin und her"-
-- Verkehr) werden hier NICHT erfasst – dafür wäre eine separate
-- Anbindung nötig (z. B. Resend Inbound-Webhook mit eigener
-- verifizierter Domain, oder IMAP-Abruf eines Postfachs).
--
-- Verändert KEINE bestehende Tabelle. Einmalig im Supabase
-- Dashboard -> SQL Editor ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  invoice_number text,
  type text NOT NULL CHECK (type IN ('angebot', 'rechnung', 'mahnung')),
  to_email text NOT NULL,
  subject text NOT NULL,
  resend_id text,
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_project_id ON public.email_log (project_id);
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at ON public.email_log (sent_at);

COMMENT ON TABLE public.email_log IS
  'Protokoll ausgehender E-Mails (Angebot/Rechnung/Mahnung) pro Projekt. Nur Versand, keine eingehenden Antworten.';
