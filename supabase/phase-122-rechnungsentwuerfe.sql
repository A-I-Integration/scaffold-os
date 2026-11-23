-- Phase 122: Rechnungsentwürfe (Faktura) – rein additiv, keine bestehende Tabelle wird geändert.
-- Vor dem Deploy der App im Supabase SQL-Editor ausführen.
--
-- Ein Entwurf ist eine gespeicherte, noch nicht festgeschriebene Rechnung OHNE Rechnungsnummer.
-- Beim Festschreiben wird die Rechnung über denselben Weg wie jede andere angelegt (POST /api/invoices:
-- Nummernvergabe, Freigabe-Pflicht, Steuerprüfung, Firmen-Snapshot); danach wird der Entwurf gelöscht.
-- Damit entstehen keine Lücken im Rechnungsnummernkreis und die Summen/Auswertungen/DATEV bleiben unberührt.
-- Zugriff nur über den Server (Service-Key): RLS aktiv, bewusst ohne Policy für Browser-Sitzungen.

CREATE TABLE IF NOT EXISTS public.invoice_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  invoice_type text NOT NULL DEFAULT 'standard' CHECK (invoice_type IN ('standard', 'abschlag', 'schluss')),
  netto_vorschau numeric(12,2) NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_invoice_drafts_updated ON public.invoice_drafts (updated_at DESC);
ALTER TABLE public.invoice_drafts ENABLE ROW LEVEL SECURITY;

-- Prüfung: Tabelle muss erscheinen
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_drafts';
