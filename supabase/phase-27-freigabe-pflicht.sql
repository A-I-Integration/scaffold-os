-- ============================================================
-- Phase 27: Pflicht-Verknüpfung Prüfung/Freigabe → Rechnung
--
-- Ab jetzt kann KEINE Rechnung zu einem Projekt angelegt werden,
-- ohne dass für dieses Projekt ein Dokumentationseintrag
-- "Prüfung/Freigabe" mit freigegeben = true existiert (siehe
-- Dokumentation-Modul, Phase 18/24).
--
-- Admin-Überschreibung möglich (mit Pflicht-Begründung), wird hier
-- protokolliert.
--
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor
-- ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_freigabe_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  admin_id uuid,
  grund text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_freigabe_override_project ON public.invoice_freigabe_override (project_id);

COMMENT ON TABLE public.invoice_freigabe_override IS
  'Protokoll jeder Admin- oder Disponent-Überschreibung der Pflicht-Verknüpfung Prüfung/Freigabe → Rechnung (Phase 27). Jede Überschreibung braucht eine Begründung. Spalte admin_id enthält die user id der überschreibenden Person (admin oder disponent).';
