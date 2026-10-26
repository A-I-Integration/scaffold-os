-- Leistungsverzeichnisse je Baustelle (Hauptauftrag, Bestellwerterhöhung, Teilabbau, Nachtrag) – rein additiv.
CREATE TABLE IF NOT EXISTS public.projekt_lv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  art text NOT NULL CHECK (art IN ('auftrag','bestellwerterhoehung','teilabbau','nachtrag')),
  titel text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','gueltig','abgerechnet')),
  lv jsonb NOT NULL,
  summe_netto numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE INDEX IF NOT EXISTS projekt_lv_project_idx ON public.projekt_lv (project_id, version DESC);
ALTER TABLE public.projekt_lv ENABLE ROW LEVEL SECURITY; -- Zugriff nur über die Server-Schnittstelle (Service-Rolle)

-- Prüfung: eine Zeile muss erscheinen
SELECT table_name FROM information_schema.tables WHERE table_name = 'projekt_lv';
