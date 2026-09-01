-- ============================================================
-- SCAFFOLD OS – Migration: Kalkulations-Grundlagen + Artikelgewicht
-- EINMAL pro Supabase-Projekt ausführen (Master + jede Kunden-Instanz):
-- Supabase Dashboard → SQL Editor → einfügen → Run
-- Idempotent: mehrfach ausführen schadet nicht.
-- ============================================================

-- 1) Kalkulations-Grundlagen in den Firmeneinstellungen
--    (werden in den Einstellungen unter „Kalkulations-Grundlagen" gepflegt
--     und von der Angebots-Kalkulation statt der bisherigen Festwerte genutzt)
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_hourly_rate     numeric(10,2) DEFAULT 65;    -- Stundensatz (€/h), Standard 65
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_hours_per_sqm   numeric(6,2)  DEFAULT 2.0;  -- Montagestunden pro m² Gerüst
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_transport_per_kg numeric(10,2) DEFAULT 0.80; -- Transport (€/kg)
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_transport_min   numeric(10,2) DEFAULT 250;  -- Transport-Mindestpauschale (€)
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_trip_flat       numeric(10,2) DEFAULT 0;    -- Fahrtkosten-Pauschale pro Baustelle (€, deckt Sprit + Fuhrpark; 0 = aus)
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_permit_low      numeric(10,2) DEFAULT 250;  -- Genehmigung bis 12 m (€)
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_permit_high     numeric(10,2) DEFAULT 450;  -- Genehmigung über 12 m (€)
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_crane_day       numeric(10,2) DEFAULT 850;  -- Kran-Tagessatz (€)

-- 2) Gewicht pro Lagerartikel (für die Transport-Kalkulation)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS weight_kg numeric(10,2) DEFAULT 0;
