-- Fristen auch für Geräte, Mitarbeiter, Betrieb und Gerüstmaterial (erweitert phase-fahrzeuge.sql) – rein additiv.
ALTER TABLE public.fahrzeuge ADD COLUMN IF NOT EXISTS kategorie text NOT NULL DEFAULT 'fahrzeug';
ALTER TABLE public.fahrzeuge DROP CONSTRAINT IF EXISTS fahrzeuge_kategorie_check;
ALTER TABLE public.fahrzeuge ADD CONSTRAINT fahrzeuge_kategorie_check CHECK (kategorie IN ('fahrzeug','geraet','mitarbeiter','betrieb','material'));
-- Prüfarten werden in der Anwendung geprüft; die alte feste Liste wird aufgehoben
ALTER TABLE public.fahrzeug_fristen DROP CONSTRAINT IF EXISTS fahrzeug_fristen_art_check;
ALTER TABLE public.fahrzeuge DROP CONSTRAINT IF EXISTS fahrzeuge_art_check;

-- Prüfung: eine Zeile mit kategorie muss erscheinen
SELECT column_name FROM information_schema.columns WHERE table_name = 'fahrzeuge' AND column_name = 'kategorie';
