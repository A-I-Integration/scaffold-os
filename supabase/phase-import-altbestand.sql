-- Altbestand-Kennzeichnung für übernommene Rechnungen (CSV-Import aus dem bisherigen Programm) – rein additiv.
-- Vor dem Deploy der App im Supabase SQL-Editor ausführen.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS importiert boolean NOT NULL DEFAULT false;

-- Prüfung: eine Zeile muss erscheinen
SELECT column_name FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'importiert';
