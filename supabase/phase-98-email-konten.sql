-- ============================================================
-- Phase 98: E-Mail-Konten (Postfach pro Nutzer) + Kunden-Mail-Archiv
--
-- Der Code (app/api/email-accounts, app/api/kunden/[id]/emails) setzt
-- diese beiden Tabellen voraus; es gab bisher keine SQL-Datei dafür.
--
-- email_accounts   : ein Postfach pro Nutzer (employee_id) ODER gemeinsame
--                    Postfächer wie info@ (employee_id = NULL). Das Passwort
--                    ist AES-256-GCM-verschlüsselt (EMAIL_ENCRYPTION_KEY).
-- customer_emails  : aus dem Postfach gelesene Mails je Kunde (Archiv).
--
-- Sicherheit: RLS ist aktiv und es gibt bewusst KEINE Policies. Damit sind
-- die Tabellen für Browser-Zugriffe gesperrt; die API-Routen greifen mit
-- dem Service-Key zu (der RLS umgeht). Es ändert KEINE bestehende Tabelle.
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = gemeinsames Postfach
  bezeichnung        text,
  email_address      text NOT NULL,
  imap_host          text NOT NULL,
  imap_port          integer NOT NULL,
  imap_secure        boolean NOT NULL DEFAULT true,
  smtp_host          text NOT NULL,
  smtp_port          integer NOT NULL,
  smtp_secure        boolean NOT NULL DEFAULT true,
  encrypted_password text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_emails (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  email_account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  imap_uid         bigint NOT NULL,
  imap_mailbox     text NOT NULL,
  richtung         text NOT NULL CHECK (richtung IN ('eingehend', 'ausgehend')),
  betreff          text,
  von              text,
  an               text,
  datum            timestamptz,
  "text"           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, email_account_id, imap_mailbox, imap_uid)
);

CREATE INDEX IF NOT EXISTS idx_customer_emails_kunde ON public.customer_emails (customer_id, datum DESC);

ALTER TABLE public.email_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_emails ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_accounts IS
  'Verbundene Postfächer (eigenes je Nutzer oder gemeinsam). Passwort verschlüsselt, nie im Klartext.';
COMMENT ON TABLE public.customer_emails IS
  'Aus dem Postfach gelesene Mails je Kunde (dauerhaftes Archiv, dedupliziert).';
