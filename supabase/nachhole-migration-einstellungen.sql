-- ============================================================
-- SCAFFOLD OS – NACHHOLE-MIGRATION: Einstellungen speichern
-- (3 Migrationen kombiniert, idempotent)
-- ============================================================
-- SYMPTOM: Einstellungen -> Speichern -> 'Da ist leider etwas
-- schiefgegangen.'
-- URSACHE: Diese drei Migrationen wurden nie im SQL Editor
-- ausgefuehrt. Die API sendet die Felder (calc_*, mahnung_*,
-- preisliste_*), die Spalten fehlen in der DB -> PostgREST
-- lehnt das UPDATE ab -> 500.
-- HEILUNG: Dieses Skript EINMAL im SQL Editor ausfuehren.
-- IF NOT EXISTS = mehrfach ausfuehren schadet nicht.
-- ADDITIV: Kein DROP, keine Typ-Aenderung, keine Daten werden
-- angefasst. Nur fehlende Spalten mit Defaults werden ergaenzt.
-- ============================================================

-- ── 1) Kalkulations-Grundlagen (migration-kalkulations-grundlagen) ──
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_hourly_rate      numeric(10,2) DEFAULT 65;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_hours_per_sqm    numeric(6,2)  DEFAULT 2.0;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_transport_per_kg numeric(10,2) DEFAULT 0.80;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_transport_min    numeric(10,2) DEFAULT 250;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_trip_flat        numeric(10,2) DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_permit_low       numeric(10,2) DEFAULT 250;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_permit_high      numeric(10,2) DEFAULT 450;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS calc_crane_day        numeric(10,2) DEFAULT 850;

-- Gewicht pro Lagerartikel (gehoert zur selben Migration)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS weight_kg numeric(10,2) DEFAULT 0;

-- ── 2) Mahnwesen (phase-36-mahnung-zinsen) ──
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS mahnung_pauschale        numeric(10,2) DEFAULT 5.00;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS mahnung_verzugszinssatz  numeric(5,2)  DEFAULT 10.52;

-- ── 3) Preisliste Gerüsttypen (phase-46-preisliste-geruesttypen) ──
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS preisliste_geruesttypen JSONB DEFAULT '[]'::jsonb;

-- ── 4) Sicherheitsnetz: Singleton-Zeile muss existieren ──
-- Die API PATCHt genau diese eine Zeile. Fehlt sie, wuerde
-- 'Speichern' erfolgreich sein, aber nichts persistieren.
INSERT INTO company_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── Erfolgskontrolle ──
select 'company_settings-Spalten:' as info;
select column_name
from information_schema.columns
where table_name = 'company_settings'
  and column_name like any (array['calc_%', 'mahnung_%', 'preisliste_%'])
order by column_name;
