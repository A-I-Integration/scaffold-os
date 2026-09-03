-- ============================================================
-- Phase 33: Fern-Annahme-Link fürs Angebot (Neuaufbau)
--
-- War schon einmal gebaut, ist in diesem Code-Stand aber nicht mehr
-- vorhanden. Neu aufgesetzt: eigene Tabelle mit einem nicht
-- erratbaren Zufalls-Token pro Projekt statt der internen Projekt-ID
-- im Link – so kann ein Kunde ohne Login NUR sein eigenes Angebot
-- sehen, nie fremde Projekte/Preise.
--
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor
-- ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz DEFAULT now(),
  UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_access_tokens_token ON public.project_access_tokens (token);

COMMENT ON TABLE public.project_access_tokens IS
  'Ein nicht erratbarer Zufalls-Token pro Projekt für die Fern-Annahme des Angebots ohne Login (siehe /angebot/[token]).';
