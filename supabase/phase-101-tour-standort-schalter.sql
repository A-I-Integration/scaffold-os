-- ============================================================
-- SCAFFOLD OS – Phase 101: Schalter "Standort bei Touren erfassen"
--
-- Zweck: Jeder Betrieb entscheidet in Einstellungen selbst, ob beim
-- Knopf "Vom Hof gefahren / Zurueck auf dem Hof" und waehrend der Fahrt
-- Standortdaten erfasst werden (z. B. Betriebe mit Betriebsrat: aus).
-- Standard = AN (wie bisher). Aus = nur Uhrzeiten, keine Koordinaten.
-- NUR ERGAENZEND (neue Spalte), IDEMPOTENT.
-- Im Supabase Dashboard -> SQL Editor ausfuehren.
-- ============================================================

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS tour_standort_erfassen boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.company_settings.tour_standort_erfassen IS 'true = Standort bei Touren erfassen (Standard); false = nur Uhrzeiten.';
