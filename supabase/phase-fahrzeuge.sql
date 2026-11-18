-- Fahrzeuge, Prüf-/Wartungsfristen und Dokumente (TÜV, SP, UVV, Fahrtenschreiber, Kran, Wartung) – rein additiv.
CREATE TABLE IF NOT EXISTS public.fahrzeuge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kennzeichen text NOT NULL,
  bezeichnung text NOT NULL DEFAULT '',
  art text NOT NULL DEFAULT 'lkw' CHECK (art IN ('lkw','transporter','pkw','anhaenger','kran','sonstiges')),
  gesamtgewicht_kg integer,
  erstzulassung date,
  notiz text NOT NULL DEFAULT '',
  aktiv boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fahrzeug_fristen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fahrzeug_id uuid NOT NULL REFERENCES public.fahrzeuge(id) ON DELETE CASCADE,
  art text NOT NULL CHECK (art IN ('hu','sp','uvv','tacho','kran','wartung','sonstiges')),
  bezeichnung text NOT NULL DEFAULT '',
  letzte_pruefung date,
  intervall_monate integer CHECK (intervall_monate IS NULL OR (intervall_monate BETWEEN 1 AND 120)),
  faellig_am date NOT NULL,
  notiz text NOT NULL DEFAULT '',
  -- Erinnerungen (14 / 7 Tage vorher) gelten nur für das Datum in erinnerung_fuer
  erinnerung_fuer date,
  erinnerung_t14 date,
  erinnerung_t7 date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fahrzeug_fristen_fahrzeug_idx ON public.fahrzeug_fristen (fahrzeug_id, faellig_am);

CREATE TABLE IF NOT EXISTS public.fahrzeug_dokumente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fahrzeug_id uuid NOT NULL REFERENCES public.fahrzeuge(id) ON DELETE CASCADE,
  frist_id uuid REFERENCES public.fahrzeug_fristen(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL DEFAULT '',
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  bestaetigt_am timestamptz,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fahrzeug_dokumente_fahrzeug_idx ON public.fahrzeug_dokumente (fahrzeug_id, created_at);

-- Zugriff nur über die Server-Schnittstelle (Service-Rolle)
ALTER TABLE public.fahrzeuge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fahrzeug_fristen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fahrzeug_dokumente ENABLE ROW LEVEL SECURITY;

-- Prüfung: drei Zeilen müssen erscheinen
SELECT table_name FROM information_schema.tables WHERE table_name IN ('fahrzeuge','fahrzeug_fristen','fahrzeug_dokumente') ORDER BY table_name;
