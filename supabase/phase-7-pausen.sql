-- ============================================================
-- SCAFFOLD OS – PHASE 7: Pausen in der Zeiterfassung
-- In Supabase ausführen: SQL Editor → New query → einfügen → Run
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- INHALT:
--   time_entries.break_minutes (INTEGER, Standard 0)
--   → abgezogene Pause in Minuten. Wird beim Ausstempeln
--     automatisch gesetzt (30 min ab 6 h, 45 min ab 9 h –
--     Logik in lib/worktime.ts) oder von Admin/Dispo korrigiert.
--
-- Es wird NICHTS gelöscht und NICHTS überschrieben.
-- Bestehende Einträge bekommen automatisch 0.
-- (Die Datei supabase/phase-6-pausen.sql im Repo war leer –
--  Pausen waren geplant, aber nie eingespielt.)
-- ============================================================

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN time_entries.break_minutes IS
  'Abgezogene Pause in Minuten (automatisch: 30 ab 6h, 45 ab 9h; oder manuell korrigiert)';

-- ─── Kontrolle: Spalte muss jetzt existieren ───
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'time_entries' AND column_name = 'break_minutes';
