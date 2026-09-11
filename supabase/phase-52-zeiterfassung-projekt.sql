-- Phase 52: Zeiterfassung mit Projekten verknüpfen (für Soll-Ist-
-- Vergleich geplante vs. tatsächliche Arbeitsstunden je Projekt).
-- Bewusst NULLABLE – nicht jede erfasste Zeit ist einem Projekt
-- zuordenbar (Urlaub, Krankheit, allgemeine Bürozeit usw.).

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_entries_project_idx ON time_entries (project_id) WHERE project_id IS NOT NULL;
