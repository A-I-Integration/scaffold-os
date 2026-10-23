-- ============================================================
-- SCAFFOLD OS – LV-Firmenwerte und LV-Standardpreise
--
-- Zweck: Die Firmenwerte des Leistungsverzeichnisses (Stundensätze, Mietsatz, Zuschlag, Standzeit, MwSt.,
-- Pauschalen …) lagen bisher nur im Browser. Jetzt gelten sie für alle Geräte. Dazu kommen Standardpreise
-- (EP und EP je Woche) für LV-Positionen ohne CAD-Wert (Überbrückungen, Kederplane, Aufzug, Haltestellen,
-- Dachschutz, Baustelleneinrichtung …). Pflege: Datenpflege -> "LV-Standardpreise" (nur Admin).
-- NUR ERGAENZEND (neue Spalten), IDEMPOTENT.
-- Im Supabase Dashboard -> SQL Editor ausfuehren.
-- ============================================================

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS lv_firmenwerte jsonb;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS lv_standardpreise jsonb;

COMMENT ON COLUMN public.company_settings.lv_firmenwerte IS 'LV-Dialog: Firmenwerte (Stundensaetze, Mietsatz, Zuschlag, Standzeit, MwSt. ...) als JSON.';
COMMENT ON COLUMN public.company_settings.lv_standardpreise IS 'LV: Standardpreise je Position, JSON {Positionsanfang: {ep, epJeWoche}}.';
