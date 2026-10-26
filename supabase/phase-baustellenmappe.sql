-- ============================================================
-- Baustellenmappe: Unterlagen je Baustelle per QR-Code / Link
--
-- Papier am Gerüst wird nass oder geht verloren. Stattdessen liegen die
-- Unterlagen im System, und ein QR-Code am Gerüst öffnet sie.
--
-- * Welche Dokumente in der Mappe erscheinen, steht je Dokument in
--   project_media.metadata (mappe = true, kategorie = '…') – keine Schema-Änderung.
-- * Firmen-Vorlagen sind project_media-Einträge ohne Projekt mit metadata.vorlage = true.
-- * Neu ist nur die Link-Tabelle. Der Link zeigt ausschließlich die als „in Mappe"
--   markierten Dokumente EINER Baustelle – nie Preise, Kunden oder andere Projekte.
-- * Links laufen standardmäßig nicht ab (ein gedruckter QR-Code muss halten),
--   lassen sich aber jederzeit widerrufen.
--
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_mappe_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_project_mappe_links_project ON public.project_mappe_links (project_id);

-- Zugriff nur über den Server (Service-Rolle), wie bei den anderen Link-Tabellen.
ALTER TABLE public.project_mappe_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.project_mappe_links IS
  'Öffentliche Links/QR-Codes auf die Baustellenmappe (siehe /baustelle/[token]). Nur Dokumente mit metadata.mappe = true, widerrufbar.';
