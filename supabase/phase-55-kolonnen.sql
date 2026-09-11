-- Phase 55: Kolonnen (feste Teams) – bei 15-20 Kolonnen braucht jeder
-- Bauleiter eine feste Zuordnung zu seinem eigenen Team, während
-- Disposition/Admin alle Kolonnen sehen und jederzeit umstrukturieren
-- können.

CREATE TABLE IF NOT EXISTS kolonnen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bauleiter_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jeder Mitarbeiter gehört zu höchstens einer Kolonne (einfaches,
-- verständliches Modell – wer mehreren Kolonnen zugleich angehören
-- müsste, ist ein Sonderfall, der bewusst nicht abgebildet wird).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS kolonne_id UUID REFERENCES kolonnen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_kolonne_idx ON employees (kolonne_id) WHERE kolonne_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS kolonnen_bauleiter_idx ON kolonnen (bauleiter_id) WHERE bauleiter_id IS NOT NULL;

COMMENT ON TABLE kolonnen IS
  'Feste Gerüstbau-Teams (Kolonnen) mit einem Bauleiter – Bauleiter sehen/verwalten nur ihre eigene Kolonne, Admin/Disposition alle.';
