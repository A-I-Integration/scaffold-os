-- ============================================================
-- SCAFFOLD OS – Lead-Termine (Startseiten-Terminbuchung)
-- ============================================================
-- EINMALIG manuell im SQL-Editor der MASTER-Supabase ausführen
-- (nicht in Kunden-Instanzen!).
--
-- Die Tabelle speichert gebuchte Beratungstermine von der
-- Startseite. UNIQUE(datum, uhrzeit) verhindert Doppelbuchungen
-- zuverlässig auf Datenbankebene (Race-Condition-sicher).
--
-- Zugriff: ausschließlich über die API-Route /api/lead/termin
-- mit SERVICE_ROLE_KEY. RLS ohne Policies → für anon/auth
-- komplett unsichtbar.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_termine (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datum      date NOT NULL,
  uhrzeit    text NOT NULL,
  art        text NOT NULL CHECK (art IN ('telefon', 'videocall')),
  name       text NOT NULL,
  firma      text NOT NULL,
  email      text NOT NULL,
  telefon    text,
  nachricht  text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (datum, uhrzeit)
);

ALTER TABLE lead_termine ENABLE ROW LEVEL SECURITY;
-- bewusst KEINE Policies: nur das Backend (Service Role) darf lesen/schreiben

CREATE INDEX IF NOT EXISTS idx_lead_termine_datum ON lead_termine(datum);
