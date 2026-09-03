-- ============================================================
-- Phase 28: Kunden vervollständigen
--
-- 1) project_assignments – formale Mitarbeiter-Zuordnung zu Aufträgen
-- 2) customer_contacts   – mehrere Ansprechpartner pro Kunde
--
-- (Vertragsdokumente brauchen keine neue Tabelle – sie nutzen die
-- bestehende project_media-Tabelle mit metadata.kind = 'vertrag'.)
--
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor
-- ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  rolle text, -- z.B. "Bauleiter", "Kolonne", frei wählbar
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE (project_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_project_assignments_project ON public.project_assignments (project_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_employee ON public.project_assignments (employee_id);

COMMENT ON TABLE public.project_assignments IS
  'Formale Zuordnung: welcher Mitarbeiter ist welchem Auftrag zugewiesen (bisher nur indirekt über Zeiterfassung/Touren ableitbar).';

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  bezeichnung text, -- z.B. "Buchhaltung", "Bauleiter beim Kunden"
  email text,
  phone text,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON public.customer_contacts (customer_id);

COMMENT ON TABLE public.customer_contacts IS
  'Mehrere Ansprechpartner pro Kunde (die customers-Tabelle selbst hat nur ein einzelnes Kontaktfeld für den Hauptkontakt).';
