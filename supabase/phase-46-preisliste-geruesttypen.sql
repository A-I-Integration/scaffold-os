-- Phase 46: Preisliste je Gerüst-Typ für den Festpreis-Modus im Aufmaß
-- (z.B. Arbeits-/Schutzgerüst, Hängegerüst, Fahrgerüst, Traggerüst,
-- Doka-Träger/Baustützen – frei benennbar, nicht fest vorgegeben)

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS preisliste_geruesttypen JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN company_settings.preisliste_geruesttypen IS
  'Array von { name: string, preis_pro_m2: number } – feste Preise je Gerüst-Typ für den schnellen Festpreis-Modus im Aufmaß.';
