-- „Noch abzurechnen“ je Baustelle und je Rechnung: von Hand erfasste Posten, die noch in eine Rechnung gehören
-- (z. B. Erschwernis durch die Lage der Baustelle, Zusatzleistung, Material). Rein additiv.
-- Vor dem Deploy der App im Supabase SQL-Editor ausführen.
-- RLS ist aktiv, es gibt bewusst keine Policies: Zugriff ausschließlich über die API-Route (Service-Rolle).

CREATE TABLE IF NOT EXISTS public.abrechnungsposten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Bezug: gehört zu dieser bereits erstellten Rechnung (z. B. nachzuberechnen); leer = allgemein zur Baustelle
  bezug_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  kategorie text NOT NULL DEFAULT 'sonstiges' CHECK (kategorie IN ('baulage', 'zusatzleistung', 'material', 'standzeit', 'sonstiges')),
  bezeichnung text NOT NULL,
  menge numeric(12,3) NOT NULL DEFAULT 1 CHECK (menge > 0),
  einheit text NOT NULL DEFAULT 'Stk.',
  einzelpreis numeric(12,2) NOT NULL DEFAULT 0 CHECK (einzelpreis >= 0),
  notiz text,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'abgerechnet', 'verworfen')),
  abgerechnet_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  abgerechnet_invoice_number text,
  abgerechnet_am date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abrechnungsposten_projekt ON public.abrechnungsposten (project_id, status, created_at DESC);
ALTER TABLE public.abrechnungsposten ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';

-- Prüfung: Tabelle muss erscheinen
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'abrechnungsposten';
