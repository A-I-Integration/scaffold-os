-- Phase 54: Wochenplanung – täglicher Einsatz je Mitarbeiter (Drag & Drop),
-- überlagert mit den bestehenden Abwesenheiten (Urlaub/Krankheit).

CREATE TABLE IF NOT EXISTS taeglicher_einsatz (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  einsatz_datum DATE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  notiz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, einsatz_datum)
);

CREATE INDEX IF NOT EXISTS taeglicher_einsatz_datum_idx ON taeglicher_einsatz (einsatz_datum);
CREATE INDEX IF NOT EXISTS taeglicher_einsatz_projekt_idx ON taeglicher_einsatz (project_id) WHERE project_id IS NOT NULL;

COMMENT ON TABLE taeglicher_einsatz IS
  'Wochenplanung: welcher Mitarbeiter ist an welchem Tag welchem Projekt zugeordnet (Drag & Drop). Urlaub/Krankheit kommen weiterhin aus der bestehenden absences-Tabelle, nicht dupliziert.';
