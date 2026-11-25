-- Phase 141: Steuerfall Luxemburg (17 % TVA) und steuerfreie innergemeinschaftliche Lieferung
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar). Voraussetzung: phase-rechnung-steuerfall.sql.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_steuerfall_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_steuerfall_check
  CHECK (steuerfall IS NULL OR steuerfall IN ('regel', '13b', 'kleinunternehmer', 'lu_tva', 'ig_lieferung'));
