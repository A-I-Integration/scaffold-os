-- ============================================================
-- Phase 37: Lieferschein als eigener Beleg (Punkt 4 der Liste)
--
-- Schließt die Lücke zwischen Ausführung (Aufbau/Abbau) und
-- Rechnung: ein eigener, unterschriebener Beleg, der bestätigt,
-- WAS wann auf-/abgebaut wurde – bevor die Rechnung entsteht.
-- Bewusst KEINE Rechnung (keine Steuerberechnung nötig), deshalb
-- eigene, leichte Tabelle statt Wiederverwendung von invoices.
--
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor
-- ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  ls_number text NOT NULL UNIQUE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_address text,
  type text NOT NULL CHECK (type IN ('aufbau', 'abbau')),
  performed_date date NOT NULL DEFAULT current_date,
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  signed_by_name text,
  signature_data_url text,
  company_snapshot jsonb
);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_project ON delivery_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_customer ON delivery_notes(customer_id);

-- Eigene Nummernfolge (LS-JAHR-NNNN), unabhängig von Rechnungen/Gutschriften,
-- nach exakt demselben, bewährten Muster (verhindert das Überladungs-Problem
-- von Phase 22/31: eigene Funktion statt eines weiteren Parameters an
-- next_invoice_number).
CREATE TABLE IF NOT EXISTS delivery_note_counters (
  year int NOT NULL,
  last_number int NOT NULL DEFAULT 0,
  PRIMARY KEY (year)
);

CREATE OR REPLACE FUNCTION next_delivery_note_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  y int := extract(year from current_date)::int;
  n int;
BEGIN
  INSERT INTO delivery_note_counters (year, last_number)
  VALUES (y, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_number = delivery_note_counters.last_number + 1
  RETURNING last_number INTO n;

  RETURN 'LS-' || y || '-' || lpad(n::text, 4, '0');
END;
$$;

COMMENT ON TABLE delivery_notes IS
  'Lieferscheine: bestätigen Auf-/Abbau vor der Rechnungsstellung, mit Materialliste und optionaler Kundenunterschrift.';
