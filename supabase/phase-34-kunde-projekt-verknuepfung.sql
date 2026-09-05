-- ============================================================
-- Phase 34: Echte Kunde↔Projekt-Verknüpfung (statt Namensvergleich)
--
-- Bisher wurde ein Projekt/eine Rechnung nur über den TEXT-Vergleich
-- des Kundennamens einem Kunden zugeordnet. Tippfehler oder eine
-- andere Schreibweise als im Kundenstamm → die Rechnung "gehört"
-- sichtbar zu niemandem, obwohl sie im System existiert.
--
-- Jetzt: echte Fremdschlüssel-Spalten. Rein additiv und NULLABLE –
-- bestehende Projekte/Rechnungen ohne customer_id funktionieren
-- weiter über den alten Namensvergleich als Rückfalloption.
--
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);

COMMENT ON COLUMN projects.customer_id IS
  'Echte Verknüpfung zum Kundenstamm. NULL = altes Projekt vor dieser Umstellung, oder Auftrag ohne Kundenstamm-Eintrag (fällt auf Namensvergleich zurück).';
COMMENT ON COLUMN invoices.customer_id IS
  'Echte Verknüpfung zum Kundenstamm (direkt oder über das verknüpfte Projekt übernommen).';

-- Einmalige Nachpflege: bestehende Projekte/Rechnungen, deren Name exakt
-- (Groß-/Kleinschreibung ignoriert) zu einem Kundenstamm-Eintrag passt,
-- automatisch verknüpfen. Alles andere bleibt NULL und läuft über den
-- bisherigen Namensvergleich weiter – nichts geht verloren.
UPDATE projects p
SET customer_id = c.id
FROM customers c
WHERE p.customer_id IS NULL
  AND p.name IS NOT NULL
  AND lower(trim(p.name)) = lower(trim(c.name));

UPDATE invoices i
SET customer_id = p.customer_id
FROM projects p
WHERE i.customer_id IS NULL
  AND i.project_id = p.id
  AND p.customer_id IS NOT NULL;

UPDATE invoices i
SET customer_id = c.id
FROM customers c
WHERE i.customer_id IS NULL
  AND lower(trim(i.customer_name)) = lower(trim(c.name));
