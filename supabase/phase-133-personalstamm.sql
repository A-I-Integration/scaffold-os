-- Phase 133: Personalstamm (Lohn-/Finanzamt-Daten) und Mitarbeiter-Dokumente
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar)
--
-- Beide Tabellen enthalten sensible Personendaten. RLS ist aktiv, aber bewusst OHNE Policy:
-- Zugriff nur über die API-Routen (Service Role Key) mit Rollenprüfung.
--   employee_personal  -> nur Chef (admin)
--   employee_documents -> Chef und Disposition

-- 1) Stammdaten je Mitarbeiter (1:1 zu employees)
create table if not exists employee_personal (
  employee_id uuid primary key references employees(id) on delete cascade,
  geburtsname text,
  geburtsdatum date,
  geburtsort text,
  staatsangehoerigkeit text,
  strasse text,
  plz text,
  ort text,
  telefon_privat text,
  notfall_name text,
  notfall_telefon text,
  sv_nummer text,
  steuer_id text,
  steuerklasse smallint check (steuerklasse between 1 and 6),
  kinderfreibetraege numeric(3,1) check (kinderfreibetraege >= 0),
  konfession text check (konfession in ('keine','ev','rk','sonstige')),
  krankenkasse text,
  iban text,
  bic text,
  eintrittsdatum date,
  austrittsdatum date,
  beschaeftigungsart text check (beschaeftigungsart in ('vollzeit','teilzeit','minijob','aushilfe','azubi')),
  taetigkeit text,
  notiz text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table employee_personal enable row level security;

-- 2) Dokumente / Bescheinigungen mit Gültigkeit
create table if not exists employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  kategorie text not null check (kategorie in ('personalien','lehrgang','g_untersuchung','fuehrerschein','sonstiges')),
  bezeichnung text not null,
  ausgestellt_am date,
  gueltig_bis date,
  file_path text,
  file_name text,
  notiz text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table employee_documents enable row level security;
create index if not exists idx_employee_documents_employee on employee_documents(employee_id);
create index if not exists idx_employee_documents_gueltig on employee_documents(gueltig_bis);

-- 3) Privater Bucket für die Dateien
insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do update set public = false;
