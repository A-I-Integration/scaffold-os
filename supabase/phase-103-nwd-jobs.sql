-- ============================================================
-- SCAFFOLD OS – Phase 103: NWD-Import (Konvertierung über Autodesk Platform Services)
--
-- Im Supabase SQL Editor ausführen (einmal). Kann gefahrlos wiederholt werden:
-- legt nur eine NEUE Tabelle an, verändert nichts Bestehendes.
-- RLS an, keine Policies → Zugriff nur über die API (Service-Role-Key), wie bei ki_jobs.
--
-- Eine Zeile = ein Konvertierungsauftrag (und damit eine kostenpflichtige APS-Übersetzung).
-- Die Tabelle dient auch dem Kosten-Schutz: 1 Auftrag/Minute/Nutzer und Tageslimit je Instanz werden hier gezählt.
-- ============================================================

create table if not exists public.nwd_jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  dateiname        text not null,
  bytes            bigint not null,
  -- upload → konvertierung → speichern → fertig | fehler
  status           text not null default 'upload'
                   check (status in ('upload', 'konvertierung', 'speichern', 'fertig', 'fehler')),
  -- Stufe der Übersetzung bei APS: 'svf' (Navisworks lesen) → 'obj' (Geometrie exportieren)
  stufe            text,
  aps_objekt       text,            -- Schlüssel der Datei im APS-Bucket (wird nach Erfolg/Fehler gelöscht)
  aps_urn          text,            -- Base64-URN des APS-Objekts (Zuordnung für den Webhook)
  fortschritt      text,            -- Text für die Anzeige, z. B. „45 % umgewandelt“
  ergebnis_pfad    text,            -- Pfad der konvertierten Datei im Storage (Bucket project-media)
  ergebnis_format  text,            -- 'obj' | 'gltf'
  fehler_code      text,            -- z. B. 'aps-fehler', 'zeitueberschreitung', 'kontingent'
  fehler_text      text,
  erstellt_am      timestamptz not null default now(),
  gestartet_am     timestamptz,     -- Übersetzung bei APS angestoßen
  fertig_am        timestamptz,
  aufgeraeumt      boolean not null default false
);

create index if not exists idx_nwd_jobs_user_zeit on public.nwd_jobs (user_id, erstellt_am desc);
create index if not exists idx_nwd_jobs_urn on public.nwd_jobs (aps_urn);
create index if not exists idx_nwd_jobs_zeit on public.nwd_jobs (erstellt_am desc);

alter table public.nwd_jobs enable row level security;
