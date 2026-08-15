-- ============================================================
-- SCAFFOLD OS – Phase 16: Onboarding-Assistent
-- EINMALIG im Supabase SQL-Editor der KUNDEN-Datenbank ausführen
-- (und identisch in supabase/kunden-schema.sql für Neukunden).
-- Idempotent: Mehrfach-Ausführung ist sicher.
-- ============================================================

-- Merker, ob die Ersteinrichtung abgeschlossen wurde.
-- Der Onboarding-Assistent zeigt sich, solange das false ist.
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;
