-- ============================================================
-- Phase 25: Aufmaß-Versionierung
--
-- Wichtiger Fund dabei: "Projekt speichern" in Aufmaß Schritt 6 hat
-- bisher IMMER ein neues Projekt angelegt (POST), auch beim erneuten
-- Speichern eines bereits bestehenden Projekts – dadurch entstanden
-- Duplikate statt einer Aktualisierung. Das ist mit diesem Update
-- mitbehoben (siehe schritt6/page.tsx: PATCH statt POST, wenn schon
-- eine savedProjectId vorhanden ist).
--
-- Diese Migration: eine neue Tabelle project_versions. Bei jeder
-- Aktualisierung eines bestehenden Projekts (PATCH mit "data") wird
-- der bisherige Stand hier als Version gesichert, BEVOR er
-- überschrieben wird. Der aktuelle Stand bleibt wie bisher direkt
-- in projects.data.
--
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor
-- ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  name text,
  adresse text,
  data jsonb,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  note text
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON public.project_versions (project_id, version_number DESC);

COMMENT ON TABLE public.project_versions IS
  'Historie früherer Stände eines Projekts (Aufmaß-Versionierung). Wird bei jeder Aktualisierung eines bestehenden Projekts automatisch vor dem Überschreiben angelegt.';
