-- ============================================================
-- SCAFFOLD OS – Phase 100: "Vom Hof gefahren / Zurück auf dem Hof"
--
-- Zweck: Mitarbeiter/Bauleiter drücken in "Meine Touren" beim Losfahren
-- und bei der Rückkehr auf den Knopf. Gespeichert werden Uhrzeit und
-- (wenn das Handy sie liefert) die Position. Aus den Zeiten ergibt sich
-- die echte Fahrtdauer Hof -> Baustelle(n) -> Hof.
-- NUR ERGAENZEND (neue Spalten), IDEMPOTENT (IF NOT EXISTS) - bestehende
-- Daten bleiben unberuehrt, jederzeit erneut ausfuehrbar.
-- Im Supabase Dashboard -> SQL Editor ausfuehren.
-- ============================================================

ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS departed_at  timestamptz;
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS departed_lat double precision;
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS departed_lng double precision;
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS returned_at  timestamptz;
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS returned_lat double precision;
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS returned_lng double precision;

COMMENT ON COLUMN public.tours.departed_at  IS 'Zeitpunkt "Vom Hof gefahren" (Knopf in Meine Touren).';
COMMENT ON COLUMN public.tours.returned_at  IS 'Zeitpunkt "Zurück auf dem Hof" (Knopf in Meine Touren).';
