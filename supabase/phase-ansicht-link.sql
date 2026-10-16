-- ============================================================
-- 3D-Ansichtslink (nur lesend) für CAD-Projekte
--
-- Für Statiker/Ingenieurbüros, Kunden und Monteure: Ein nicht
-- erratbarer Zufalls-Token öffnet NUR die 3D-Ansicht und die
-- Stückliste OHNE Preise des einen Projekts. Eigene Tabelle (nicht
-- project_access_tokens), damit dieser Link niemals ein Angebot
-- annehmen oder Preise zeigen kann. Mehrere Links je Projekt sind
-- möglich, jeder hat ein Ablaufdatum und lässt sich widerrufen.
--
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor
-- ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_view_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_project_view_links_project ON public.project_view_links (project_id);

-- Zugriff nur über den Server (Service-Rolle), wie bei project_access_tokens.
ALTER TABLE public.project_view_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.project_view_links IS
  'Nur-Lese-Links auf die 3D-Ansicht eines CAD-Projekts (siehe /ansicht/[token]). Ohne Preise, mit Ablaufdatum, widerrufbar.';
