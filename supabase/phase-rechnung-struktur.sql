-- Rechnung strukturieren: Gerüstnummer und Leistungsdatum
-- Rein additiv, keine bestehenden Daten werden verändert. Vor dem Deploy der App ausführen.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS geruest_nr text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS leistungsdatum date;
CREATE INDEX IF NOT EXISTS invoices_geruest_nr_idx ON invoices (geruest_nr);
-- Prüfung: beide Spalten müssen erscheinen
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'invoices' AND column_name IN ('geruest_nr', 'leistungsdatum');
