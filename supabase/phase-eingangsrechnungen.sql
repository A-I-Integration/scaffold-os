-- Externe Rechnungen (Eingangsrechnungen) je Baustelle: Nachunternehmer, Material, Sonstiges – rein additiv.
-- Vor dem Deploy der App im Supabase SQL-Editor ausführen.
-- Die Dateien liegen im vorhandenen PRIVATEN Bucket 'invoice-attachments' (Pfad eingang/...), Zugriff nur über den Server.
-- RLS ist aktiv, es gibt bewusst keine Policies: Zugriff ausschließlich über die API-Route (Service-Rolle).

CREATE TABLE IF NOT EXISTS public.eingangsrechnungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lieferant text NOT NULL,
  subcontractor_id uuid REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  art text NOT NULL DEFAULT 'material' CHECK (art IN ('nachunternehmer', 'material', 'sonstiges')),
  rechnungsnummer text,
  rechnungsdatum date,
  faellig_am date,
  netto numeric(12,2) NOT NULL CHECK (netto >= 0),
  ust_satz numeric(5,2) NOT NULL DEFAULT 19 CHECK (ust_satz >= 0 AND ust_satz <= 100),
  ust_betrag numeric(12,2) NOT NULL DEFAULT 0 CHECK (ust_betrag >= 0),
  brutto numeric(12,2) NOT NULL CHECK (brutto >= 0),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bezahlt')),
  bezahlt_am date,
  notiz text,
  storage_path text,
  file_name text,
  file_type text,
  size_bytes bigint,
  bestaetigt_am timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Weitere Angaben aus dem automatischen Auslesen (auch ausführbar, wenn die Tabelle schon besteht)
ALTER TABLE public.eingangsrechnungen ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.eingangsrechnungen ADD COLUMN IF NOT EXISTS leistungsdatum date;
ALTER TABLE public.eingangsrechnungen ADD COLUMN IF NOT EXISTS kundennummer text;
ALTER TABLE public.eingangsrechnungen ADD COLUMN IF NOT EXISTS positionen jsonb;
CREATE INDEX IF NOT EXISTS idx_eingangsrechnungen_projekt ON public.eingangsrechnungen (project_id, rechnungsdatum DESC);
ALTER TABLE public.eingangsrechnungen ENABLE ROW LEVEL SECURITY;

-- Prüfung: Tabelle muss erscheinen
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'eingangsrechnungen';
