-- Phase 144: Externe Anfragen (Kundenportal, Stufe 1: Eingang + interne Maske + Übernahme)
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar).

-- 1) Zugangslinks (ohne Konto): ein Link je Kunde oder ein allgemeiner Link
create table if not exists anfrage_zugaenge (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token text not null unique,                      -- 48 Zeichen hex, nicht erratbar
  customer_id uuid,                                -- gesetzt = Link gehört zu diesem Kunden (nur Vorschlag, wird bei der Übernahme geprüft)
  bezeichnung text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid
);
create index if not exists anfrage_zugaenge_customer_idx on anfrage_zugaenge (customer_id);

-- 2) Anfragen
create table if not exists externe_anfragen (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nummer text unique,                              -- AF-2026-0001 (erst beim Abschließen vergeben)
  zugang_id uuid,
  customer_id uuid,                                -- Kunde aus dem Zugangslink (Vorschlag)
  absender_name text not null,
  absender_firma text,
  absender_email text,
  absender_telefon text,
  baustelle_name text,
  baustelle_adresse text,
  land text,
  wunschtermin text,
  beschreibung text,
  status text not null default 'entwurf',          -- entwurf | neu | gelesen | in_pruefung | rueckfrage | in_bearbeitung | uebernommen | abgelehnt
  eingereicht_am timestamptz,
  interne_notiz text,
  -- Übernahme (genau einmal)
  uebernahme_gestartet_am timestamptz,             -- Sperre gegen Doppelklick / zwei Büro-Nutzer
  uebernommen_art text,                            -- neu_kunde | bestehender_kunde
  uebernommen_customer_id uuid,
  uebernommen_project_id uuid,
  uebernommen_von uuid,
  uebernommen_am timestamptz,
  -- Benachrichtigung ans Büro
  benachrichtigt_am timestamptz,
  benachrichtigung_fehler text,
  benachrichtigung_versuche int not null default 0
);
create index if not exists externe_anfragen_status_idx on externe_anfragen (status);
create index if not exists externe_anfragen_customer_idx on externe_anfragen (customer_id);

-- 3) Dateien (liegen im PRIVATEN Bucket "anfragen", Zugriff nur über kurzlebige Links der App)
create table if not exists externe_anfragen_dateien (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  anfrage_id uuid not null references externe_anfragen(id) on delete cascade,
  dateiname text not null,
  mime text,
  groesse bigint,
  storage_path text not null,
  geprueft boolean not null default false          -- true = Größe und Dateikopf nach dem Hochladen serverseitig bestätigt
);
create index if not exists externe_anfragen_dateien_anfrage_idx on externe_anfragen_dateien (anfrage_id);

-- 4) Verlauf (wer hat wann was getan)
create table if not exists externe_anfragen_protokoll (
  id uuid primary key default gen_random_uuid(),
  zeitpunkt timestamptz not null default now(),
  anfrage_id uuid not null references externe_anfragen(id) on delete cascade,
  benutzer_id uuid,
  benutzer_name text,                              -- null = Kunde / System
  aktion text not null,
  von_status text,
  nach_status text,
  text text
);
create index if not exists externe_anfragen_protokoll_anfrage_idx on externe_anfragen_protokoll (anfrage_id, zeitpunkt);

-- Zugriff nur über die App (Service-Rolle); Kundendaten und Pläne sind nicht öffentlich lesbar
alter table anfrage_zugaenge enable row level security;
alter table externe_anfragen enable row level security;
alter table externe_anfragen_dateien enable row level security;
alter table externe_anfragen_protokoll enable row level security;

-- 5) Privater Datei-Bucket (public = false)
insert into storage.buckets (id, name, public)
values ('anfragen', 'anfragen', false)
on conflict (id) do update set public = false;
