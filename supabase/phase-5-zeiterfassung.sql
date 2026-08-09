-- ============================================================
-- SCAFFOLD OS – PHASE 5: Zeiterfassung (time_entries)
-- In Supabase ausführen: SQL Editor → New query → einfügen → Run
-- Idempotent: kann mehrfach ausgeführt werden (IF NOT EXISTS).
--
-- VORAUSSETZUNG: Die Tabelle employees existiert (Planungs-Phase).
-- Der FK auf employees(id) wird für den Namens-Join in
-- /api/time-entries und der Stundenauswertung gebraucht.
-- ============================================================

CREATE TABLE IF NOT EXISTS time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  tour_id uuid,                         -- optional: Bezug zu tours(id)
  project_id uuid,                      -- optional: Bezug zu projects(id)
  work_date date NOT NULL,
  start_time timestamptz,               -- Einstempel-Zeitpunkt
  end_time timestamptz,                 -- Ausstempel-Zeitpunkt
  hours numeric(6,2),                   -- automatisch berechnet oder manuell
  note text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date ON time_entries(employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(work_date DESC);

-- ─── RLS ───
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_entries_authenticated_all" ON time_entries;
CREATE POLICY "time_entries_authenticated_all" ON time_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Kontrolle ───
SELECT count(*) AS eintraege FROM time_entries;
