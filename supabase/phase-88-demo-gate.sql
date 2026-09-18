-- ============================================================
-- SCAFFOLD OS – Phase 88: Demo-Gate
--
-- Zweck: Tabelle für die Demo-IP-Sperre (1× anmelden pro IP)
-- nachziehen und versionierbar machen. Die Route
-- app/api/auth/demo-gate/route.ts greift ausschließlich über
-- REST + SERVICE_ROLE_KEY zu; der 24h-Auto-Logout läuft über
-- das httpOnly-Cookie „demo_login_at" (Proxy-Prüfung) und
-- braucht KEINE Spalte/keinen Eintrag hier.
--
-- IDEMPOTENT: komplett mit IF NOT EXISTS geschrieben, jederzeit
-- erneut ausführbar (gleiches Muster wie ki_jobs, Phase 65).
-- Auf dem Demo-Projekt im Supabase Dashboard → SQL Editor
-- ausführen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.demo_ip_sperre (
  ip             text PRIMARY KEY,
  first_login_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.demo_ip_sperre IS
  'Demo-Gate: pro Internet-Anschluss (IP) nur ein Demo-Login. first_login_at nur zur Nachvollziehbarkeit.';

-- RLS an, keine Policies → Zugriff nur über API mit Service-Role-Key
-- (gleiches Muster wie der Rest der App, vgl. phase-65-ki-jobs.sql)
ALTER TABLE public.demo_ip_sperre ENABLE ROW LEVEL SECURITY;
