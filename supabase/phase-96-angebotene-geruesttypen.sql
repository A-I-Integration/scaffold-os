-- Phase 96: Welche Gerüsttypen bietet der Betrieb an? (Firmenprofil → Aufmaß Schritt 3)
-- NULL oder leeres Array = alle Typen werden angeboten (wie bisher).

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS angebotene_geruesttypen JSONB DEFAULT NULL;

COMMENT ON COLUMN company_settings.angebotene_geruesttypen IS
  'Array von Gerüsttyp-IDs (z.B. ["fassade","haenge"]). NULL/[] = alle Typen.';
