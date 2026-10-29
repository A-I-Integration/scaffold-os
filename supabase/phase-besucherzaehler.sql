-- ============================================================
-- SCAFFOLD OS – Besucherzähler (nur Master-Instanz scaffoldos.de)
-- ============================================================
-- EINMALIG manuell im SQL-Editor der MASTER-Supabase ausführen
-- (nicht in Kunden-Instanzen!).
--
-- Cookie-los und ohne Speicherung der IP-Adresse: Pro Aufruf wird
-- nur eine anonyme Tages-Kennung gespeichert (Hash aus IP und
-- Browser-Kennung, der sich jeden Tag ändert und nicht
-- zurückgerechnet werden kann). Damit lassen sich Aufrufe und
-- Besucher pro Tag zählen, aber keine Person wiedererkennen.
--
-- Zugriff: ausschließlich über die API-Routen mit SERVICE_ROLE_KEY.
-- RLS ohne Policies → für anon/auth komplett unsichtbar.
-- ============================================================

CREATE TABLE IF NOT EXISTS besuche (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag      date        NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Berlin')::date),
  zeit     timestamptz NOT NULL DEFAULT now(),
  pfad     text        NOT NULL,
  besucher text        NOT NULL,
  quelle   text,
  geraet   text CHECK (geraet IN ('desktop', 'mobil', 'tablet'))
);

ALTER TABLE besuche ENABLE ROW LEVEL SECURITY;
-- bewusst KEINE Policies: nur das Backend (Service Role) darf lesen/schreiben

CREATE INDEX IF NOT EXISTS idx_besuche_tag ON besuche(tag);

-- Auswertung für die Tagesansicht (/admin/besucher)
CREATE OR REPLACE FUNCTION besucher_statistik(p_tage int DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH grenze AS (
    SELECT ((now() AT TIME ZONE 'Europe/Berlin')::date - (GREATEST(p_tage, 1) - 1)) AS ab
  ),
  b AS (
    SELECT * FROM besuche, grenze WHERE besuche.tag >= grenze.ab
  )
  SELECT jsonb_build_object(
    'tage', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.tag)
      FROM (
        SELECT tag, count(*) AS aufrufe, count(DISTINCT besucher) AS besucher
        FROM b GROUP BY tag
      ) t
    ), '[]'::jsonb),
    'seiten', COALESCE((
      SELECT jsonb_agg(s ORDER BY s.aufrufe DESC)
      FROM (
        SELECT pfad, count(*) AS aufrufe
        FROM b GROUP BY pfad ORDER BY count(*) DESC LIMIT 15
      ) s
    ), '[]'::jsonb),
    'quellen', COALESCE((
      SELECT jsonb_agg(q ORDER BY q.aufrufe DESC)
      FROM (
        SELECT COALESCE(quelle, 'Direkt / unbekannt') AS quelle, count(*) AS aufrufe
        FROM b GROUP BY 1 ORDER BY count(*) DESC LIMIT 15
      ) q
    ), '[]'::jsonb),
    'geraete', COALESCE((
      SELECT jsonb_agg(g ORDER BY g.aufrufe DESC)
      FROM (
        SELECT COALESCE(geraet, 'unbekannt') AS geraet, count(*) AS aufrufe
        FROM b GROUP BY 1
      ) g
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION besucher_statistik(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION besucher_statistik(int) TO service_role;

-- Optional, bei Bedarf manuell: alte Einträge nach 14 Monaten löschen
-- DELETE FROM besuche WHERE tag < (now() AT TIME ZONE 'Europe/Berlin')::date - 425;
