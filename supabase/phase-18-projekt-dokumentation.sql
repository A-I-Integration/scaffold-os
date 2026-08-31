-- ============================================================
-- Phase 18: Projekt-Dokumentation (Punkte 9–13 Gerüstbau-Prozess)
--
-- Deckt ab:
--   9.  Prüfung/Freigabe nach Aufbau (Mängel, Kennzeichnung)
--   10. Nutzung/Standzeit – Änderungen während der Standzeit
--   11. Gerüständerungen
--   12. Demontage
--   13. Rücktransport (Fehlmengen/Schäden)
--
-- Design-Entscheidung: EIN generisches Ereignis-Log statt fünf
-- Einzeltabellen, weil alle fünf Punkte dieselbe Struktur haben
-- (Text + optionale Fotos + Status), nur mit unterschiedlichem
-- "type". So funktioniert es für alle 5 Rollen (admin, disponent,
-- bauleiter, mitarbeiter, lager) mit EINER Komponente/API.
--
-- project_media wird NICHT verändert (kein ALTER auf bestehende
-- Tabelle), um nichts an Aufmaß-Fotos/Grundrissen/Drohnenfotos
-- kaputt zu machen. Fotos landen stattdessen als jsonb-Array
-- direkt in project_events.photos (Pfade im Bucket "project-media",
-- Ordner projects/{project_id}/events/...).
--
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tour_stop_id uuid REFERENCES public.tour_stops(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'pruefung_freigabe',   -- 9. Prüfung/Freigabe nach Aufbau
    'standzeit',            -- 10. Nutzung/Standzeit, Änderungen
    'geruest_aenderung',     -- 11. Gerüständerungen
    'demontage',             -- 12. Demontage
    'ruecktransport',        -- 13. Rücktransport, Fehlmengen/Schäden
    'sonstiges'
  )),
  text_note text,
  photos jsonb DEFAULT '[]'::jsonb,   -- Array von Storage-Pfaden im Bucket "project-media"
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'erledigt')),
  employee_id uuid REFERENCES public.employees(id),
  created_by uuid,                    -- auth.users.id (profiles.id) des Erstellers
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_events_project_id ON public.project_events (project_id);
CREATE INDEX IF NOT EXISTS idx_project_events_type ON public.project_events (type);
CREATE INDEX IF NOT EXISTS idx_project_events_status ON public.project_events (status);

COMMENT ON TABLE public.project_events IS
  'Dokumentations-Log für den Gerüstbau-Prozess nach dem Aufmaß: Prüfung/Freigabe, Standzeit-Änderungen, Gerüständerungen, Demontage, Rücktransport. Zugänglich für alle 5 Rollen.';
