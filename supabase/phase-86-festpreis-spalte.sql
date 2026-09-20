-- ============================================================
-- SCAFFOLD OS – Phase 86: Nachhole-Migration Einstellungen
-- Spalte calc_festpreis_pro_m2 fehlte komplett
-- ============================================================
-- SYMPTOM: Einstellungen -> Speichern -> 'Da ist leider etwas
-- schiefgegangen.'
-- URSACHE: Code (API + Frontend) nutzt die Spalte
-- calc_festpreis_pro_m2 (Festpreis-Modus im Aufmaß), aber die
-- Migration wurde nie geschrieben. PostgREST lehnt den PATCH ab.
-- HEILUNG: Dieses Skript einmalig im SQL Editor ausfuehren.
-- Idempotent (IF NOT EXISTS), nichts wird zerstoert.
-- ============================================================

alter table company_settings
  add column if not exists calc_festpreis_pro_m2 numeric(10,2);

comment on column company_settings.calc_festpreis_pro_m2 is
  'Optionaler Festpreis pro m2 fuer den Festpreis-Modus im Aufmaß (Schritt 6). Leer = KI-Kalkulation bleibt Standard.';

-- Erfolgskontrolle
select column_name, data_type
from information_schema.columns
where table_name = 'company_settings'
  and column_name = 'calc_festpreis_pro_m2';
