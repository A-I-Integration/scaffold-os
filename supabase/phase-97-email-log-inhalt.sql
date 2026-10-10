-- Phase 97: E-Mail-Verlauf – Inhalt und Anhang speichern (Ansehen + erneut senden)
-- Neue Spalten sind optional. Ältere Einträge bleiben unverändert (ohne Inhalt/Anhang).

ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

COMMENT ON COLUMN public.email_log.body_html IS 'HTML-Inhalt der versendeten Mail (für Ansicht und erneutes Senden).';
COMMENT ON COLUMN public.email_log.attachment_path IS 'Pfad der versendeten PDF im Bucket project-media (email-log/…).';
