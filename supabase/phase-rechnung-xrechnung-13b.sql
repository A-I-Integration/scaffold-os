-- Rechnung: Ansprechpartner (XRechnung), Nachweis für § 13b beim Kunden, Grundstücksbezug an der Rechnung
-- Rein additiv. Nach phase-rechnung-steuerfall.sql und vor dem Deploy der App ausführen.

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS ansprechpartner text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bauleister_nachweis_bis date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS grundstuecksbezug boolean NOT NULL DEFAULT true;

SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'company_settings' AND column_name = 'ansprechpartner')
   OR (table_name = 'customers' AND column_name = 'bauleister_nachweis_bis')
   OR (table_name = 'invoices' AND column_name = 'grundstuecksbezug')
ORDER BY table_name, column_name;
