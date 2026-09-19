-- ============================================================
-- SCAFFOLD OS – Phase 89: Tour-Team (Mehrfachauswahl)
--
-- Zweck: Touren sollen mehrere Personen gleichzeitig tragen
-- (Team). Erste ID im Array = Fahrer (bleibt in driver_id),
-- alle gewaehlten IDs landen in team_ids (jsonb).
-- IDEMPOTENT (IF NOT EXISTS) - jederzeit erneut ausfuehrbar.
-- Im Supabase Dashboard -> SQL Editor ausfuehren.
-- ============================================================

ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS team_ids jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.tours.team_ids IS 'Team der Tour (Mehrfachauswahl); erste ID = Fahrer (driver_id).';
