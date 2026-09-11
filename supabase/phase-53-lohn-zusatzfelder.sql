-- Phase 53: Lohn-Zusatzfelder – Spesen, Fahrzeiten, Übernachtungen
-- je Zeiterfassungs-Eintrag (für die Lohnabrechnung).

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS spesen_euro NUMERIC(8,2) DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS fahrzeit_minuten INTEGER DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS uebernachtung BOOLEAN DEFAULT false;

COMMENT ON COLUMN time_entries.spesen_euro IS 'Verpflegungsmehraufwand/Spesen in Euro, manuell erfasst (keine automatische Steuersatz-Berechnung – bewusst, da sich die gesetzlichen Pauschalen ändern können).';
COMMENT ON COLUMN time_entries.fahrzeit_minuten IS 'Reine Fahrzeit in Minuten, getrennt von der eigentlichen Arbeitszeit erfasst.';
COMMENT ON COLUMN time_entries.uebernachtung IS 'Ob an diesem Tag eine Übernachtung (auswärtige Baustelle) angefallen ist.';
