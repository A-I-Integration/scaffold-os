-- ============================================================
-- Auftragsstand-Link: Auftraggeber sieht den aktuellen Rechnungsstand EINER Baustelle
--
-- * Nur lesen, ohne Login, über einen unerratbaren Link (48 Hex-Zeichen).
-- * Der Link zeigt nur diese eine Baustelle: Auftragswert, Rechnungen, Nachträge.
-- * Widerrufbar; läuft standardmäßig nicht ab (optionales Ablaufdatum möglich).
--
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_stand_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_project_stand_links_project ON public.project_stand_links (project_id);

-- Zugriff nur über den Server (Service-Rolle), wie bei den anderen Link-Tabellen.
ALTER TABLE public.project_stand_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.project_stand_links IS
  'Öffentliche Links auf den Auftragsstand einer Baustelle (siehe /auftrag/[token]). Nur Lesen, widerrufbar.';
