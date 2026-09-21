-- ============================================================
-- SCAFFOLD OS – PHASE 91: Fahrzeug-Tonnage + Führerschein-Klassen
-- In Supabase ausführen: SQL Editor → New query → einfügen → Run
-- Idempotent: kann mehrfach ausgeführt werden (IF NOT EXISTS).
--
-- Hintergrund: bisher wusste die App nicht, was für ein Fahrzeug ein
-- Fahrzeug ist (Sprinter/LKW), wie schwer es ist und welche Mitarbeiter
-- es überhaupt fahren dürfen. Das verhinderte eine echte Prüfung bei
-- Touren-Planung/KI-Vorschlag ("darf dieser Fahrer dieses Fahrzeug
-- fahren?").
--
-- WICHTIG: employees.drivers_license (Freitext-Feld "Führerschein")
-- bleibt unverändert bestehen - hier kommt bewusst ein NEUES,
-- strukturiertes Feld dazu, damit bereits erfasste Freitext-Angaben
-- nicht überschrieben/fehlinterpretiert werden.
-- ============================================================

-- ─── Fahrzeuge: Typ + Gewichte ───
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS typ text;
-- Zulässiges Gesamtgewicht in kg – bestimmt die ERFORDERLICHE
-- Führerschein-Klasse (siehe lib/touren/fuehrerschein.ts).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS zulaessiges_gesamtgewicht_kg numeric(10,2);
-- Nutzlast in kg (wie viel Material passt drauf) – für die spätere
-- automatische Fahrzeug-Vorauswahl anhand des Materialgewichts aus dem
-- Aufmaß (Phase 92, noch offen).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS nutzlast_kg numeric(10,2);

-- ─── Mitarbeiter: Führerschein-Klassen (strukturiert, Mehrfachauswahl) ───
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fuehrerschein_klassen text[] DEFAULT '{}';

COMMENT ON COLUMN vehicles.zulaessiges_gesamtgewicht_kg IS 'Zulässiges Gesamtgewicht in kg - bestimmt die erforderliche Führerschein-Klasse';
COMMENT ON COLUMN vehicles.nutzlast_kg IS 'Nutzlast in kg - für automatische Fahrzeug-Vorauswahl anhand Materialgewicht';
COMMENT ON COLUMN employees.fuehrerschein_klassen IS 'Führerschein-Klassen des Mitarbeiters, z.B. {B,BE,C1}, fuer Fahrzeug-Berechtigungspruefung';
