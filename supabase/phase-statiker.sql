-- ============================================================
-- SCAFFOLD OS – Statiker-Rolle (externe Ingenieurbüros)
--
-- Im Supabase SQL Editor ausführen (einmal). Kann gefahrlos wiederholt
-- werden. Es wird nichts gelöscht, außer dass die Rollen-Prüfung der
-- Tabelle "profiles" durch eine Version ersetzt wird, die zusätzlich
-- die Rolle "statiker" erlaubt.
--
-- Was das SQL macht:
--  1) Rolle "statiker" in der Rollen-Prüfung von profiles erlauben
--  2) Tabelle project_statiker: welcher Statiker darf welches Projekt sehen
--  3) Hilfsfunktion is_statiker() (liest das Flag aus dem Login-Token)
--  4) Für ALLE Tabellen mit aktivem Zeilenschutz (RLS): eine zusätzliche
--     "restriktive" Regel, die Statiker-Logins den direkten Datenbank-
--     Zugriff aus dem Browser verbietet. Normale Logins bleiben unberührt.
--     Auf "profiles" darf ein Statiker nur die eigene Zeile lesen.
--
-- Wichtig: Die App sperrt Statiker zusätzlich selbst (proxy.ts). Die
-- Regeln hier sind die zweite Sicherung, falls jemand die Datenbank
-- direkt mit dem öffentlichen Schlüssel anspricht.
-- ============================================================

-- 1) Rolle "statiker" erlauben -----------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'disponent'::text, 'bauleiter'::text, 'mitarbeiter'::text, 'lager'::text, 'statiker'::text]));

-- 2) Freigaben: Statiker <-> Projekt ------------------------------------
CREATE TABLE IF NOT EXISTS public.project_statiker (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_statiker_user ON public.project_statiker (user_id);
ALTER TABLE public.project_statiker ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Regel für normale Logins: nur der Server (Service-Schlüssel) liest/schreibt hier.
COMMENT ON TABLE public.project_statiker IS 'Freigabe: welcher Statiker-Login darf welches CAD-Projekt (nur lesend, ohne Preise) sehen.';

-- 3) Hilfsfunktion ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_statiker()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'statiker')::boolean, false)
$$;

-- 4) Direkten Datenbank-Zugriff für Statiker sperren -------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tabelle
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND c.relname NOT IN ('profiles', 'project_statiker')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS no_statiker ON public.%I', t.tabelle);
    EXECUTE format(
      'CREATE POLICY no_statiker ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_statiker()) WITH CHECK (NOT public.is_statiker())',
      t.tabelle
    );
  END LOOP;
END $$;

-- profiles: Statiker darf nur die eigene Zeile lesen (die App braucht das beim Login)
DROP POLICY IF EXISTS no_statiker ON public.profiles;
CREATE POLICY no_statiker ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_statiker() OR id = auth.uid())
  WITH CHECK (NOT public.is_statiker());

-- Dateispeicher (Fotos, Dokumente): gleiche Sperre. Falls die Datenbank das
-- Ändern dieser Tabelle nicht erlaubt, läuft der Rest trotzdem durch.
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS no_statiker ON storage.objects';
  EXECUTE 'CREATE POLICY no_statiker ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_statiker()) WITH CHECK (NOT public.is_statiker())';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'storage.objects konnte nicht angepasst werden: %', SQLERRM;
END $$;

-- Hinweis: Tabellen, die NACH diesem Lauf neu angelegt werden, bekommen die
-- Sperre nicht automatisch. Dann dieses SQL einfach noch einmal ausführen.
