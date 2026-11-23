-- Faktura F6: Änderungsverlauf der Abrechnung (wer, wann, was, warum)
-- Nur anhängen: Zeilen werden vom Server geschrieben und nie geändert oder gelöscht.
CREATE TABLE IF NOT EXISTS abrechnung_historie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  aktion text NOT NULL,
  invoice_id uuid,
  invoice_number text,
  project_id uuid,
  user_id uuid,
  grund text,
  details jsonb
);
CREATE INDEX IF NOT EXISTS abrechnung_historie_rechnung_idx ON abrechnung_historie (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS abrechnung_historie_projekt_idx ON abrechnung_historie (project_id, created_at DESC);
ALTER TABLE abrechnung_historie ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION abrechnung_historie_unveraenderbar() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'abrechnung_historie ist nur zum Anhängen da'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS abrechnung_historie_schutz ON abrechnung_historie;
CREATE TRIGGER abrechnung_historie_schutz BEFORE UPDATE OR DELETE ON abrechnung_historie FOR EACH ROW EXECUTE FUNCTION abrechnung_historie_unveraenderbar();

-- Kontrolle: muss die Tabelle zeigen
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'abrechnung_historie';
