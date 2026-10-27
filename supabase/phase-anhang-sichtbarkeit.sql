-- Rechnungsanhänge: pro Datei festlegen, ob sie im Live-Link des Auftraggebers erscheint.
-- Rein additiv. Standard: nicht sichtbar. Einmalig im Supabase Dashboard -> SQL Editor ausführen.
ALTER TABLE public.invoice_attachments ADD COLUMN IF NOT EXISTS fuer_auftraggeber boolean NOT NULL DEFAULT false;
