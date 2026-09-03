-- ============================================================
-- Phase 24: Formales Prüfprotokoll (Punkt 3 aus der Lückenliste)
--
-- Bisher war "Prüfung/Freigabe" im Dokumentation-Modul (Phase 18)
-- nur freier Text + Fotos. Es gab kein rechtsförmliches Protokoll
-- mit Gerüstklasse, Mängel-Feststellung, Kennzeichnung und
-- Freigabe-Erklärung, wie es bei einer Gerüst-Übergabe üblich ist.
--
-- Rein additiv: eine neue, optionale jsonb-Spalte. Bestehende
-- Einträge (NULL in dieser Spalte) funktionieren unverändert weiter.
--
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

ALTER TABLE public.project_events
  ADD COLUMN IF NOT EXISTS pruefung_details jsonb DEFAULT NULL;

COMMENT ON COLUMN public.project_events.pruefung_details IS
  'Nur bei type = pruefung_freigabe: strukturierte Angaben für das Prüfprotokoll-PDF (Gerüstklasse, Mängel, Kennzeichnung, Freigabe). Form: {geruestklasse, maengel_festgestellt, maengel_text, maengel_behoben, kennzeichnung_angebracht, freigegeben, freigegeben_durch, nutzungsende_geplant}.';
