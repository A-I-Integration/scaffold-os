-- ============================================================
-- SCAFFOLD OS – Phase 65: KI-Verarbeitungs-Queue
--
-- Ziel: KI-Aufrufe laufen nicht mehr synchron durch Vercel
-- (Timeout-Risiko), sondern als Jobs, die ein Hetzner-Worker
-- abarbeitet. Frontend legt Job an (Antwort sofort), pollt
-- Status, Worker rechnet im Hintergrund.
--
-- ADDITIV: Erzeugt nur eine NEUE Tabelle. Keine bestehende
-- Tabelle/Spalte/Daten wird angefasst. RLS enabled ohne
-- Policies = Zugriff nur über API mit Service-Role-Key
-- (gleiches Muster wie der Rest der App).
-- ============================================================

create table if not exists public.ki_jobs (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,                -- z. B. 'foto-analyse', 'grundriss-analyse', 'cad-analyse'
  status        text not null default 'queued'
                check (status in ('queued', 'processing', 'done', 'error')),
  project_id    uuid,                         -- optional, für Zuordnung/Anzeige
  payload       jsonb not null default '{}'::jsonb,  -- { model?, messages, meta? }
  result        jsonb,                        -- Antwort der KI (bei status='done')
  error         text,                         -- Fehlermeldung (bei status='error')
  model         text,                         -- verwendetes Modell (für Nachvollziehbarkeit)
  versuche      int  not null default 0,      -- bisherige Versuche (Retry bei 429/5xx)
  max_versuche  int  not null default 3,
  erstellt_von  uuid,                         -- User-ID des Anlegers
  erstellt_am   timestamptz not null default now(),
  gestartet_am  timestamptz,
  fertig_am     timestamptz
);

-- Index für den Worker-Poll (hot path)
create index if not exists idx_ki_jobs_status on public.ki_jobs (status, erstellt_am asc);

-- RLS an, keine Policies → nur Service-Role via API
alter table public.ki_jobs enable row level security;

-- Aufräum-Funktion (optional manuell oder per Cron aufrufbar):
-- erledigte/fehlgeschlagene Jobs älter als X Tage löschen.
create or replace function public.ki_jobs_cleanup(alter_tage int default 30)
returns int language plpgsql security definer as $$
declare
  geloescht int;
begin
  delete from public.ki_jobs
   where status in ('done', 'error')
     and fertig_am < now() - make_interval(days => alter_tage);
  get diagnostics geloescht = row_count;
  return geloescht;
end $$;
