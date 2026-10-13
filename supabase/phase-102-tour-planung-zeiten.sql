-- ============================================================
-- SCAFFOLD OS – Phase 102: Tourenplanung – Fahrtdauer & späteste Abfahrt
--
-- Zweck: Jeder Betrieb stellt in Einstellungen -> Tourenplanung selbst ein,
-- wie lange eine Fahrt dauert (Minuten) und wann die letzte Fahrt spaetestens
-- vom Hof faehrt (Minuten seit 00:00, z. B. 900 = 15:00).
-- Standard = wie bisher (180 Min / 900 = 15:00).
-- NUR ERGAENZEND (neue Spalten), IDEMPOTENT.
-- Im Supabase Dashboard -> SQL Editor ausfuehren.
-- ============================================================

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS tour_fahrt_dauer_min integer NOT NULL DEFAULT 180;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS tour_letzter_start_min integer NOT NULL DEFAULT 900;
