-- Phase 135: Lohn-Konditionen je Mitarbeiter (Urlaubsanspruch, Kündigungsfrist, Sonderzahlungen)
-- Einmalig im Supabase SQL-Editor ausführen (idempotent). Voraussetzung: Phase 133.
-- RLS aktiv, bewusst OHNE Policy: Zugriff nur über die API (nur Chef).

create table if not exists employee_konditionen (
  employee_id uuid primary key references employees(id) on delete cascade,
  kuendigungsfrist text,
  probezeit_ende date,
  notiz text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table employee_konditionen enable row level security;

-- Urlaubsanspruch mit Verlauf (neuer Eintrag ab Datum, wie beim Stundenlohn)
create table if not exists employee_urlaubsanspruch (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  tage_pro_jahr numeric(4,1) not null check (tage_pro_jahr > 0 and tage_pro_jahr <= 90),
  gueltig_ab date not null,
  notiz text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (employee_id, gueltig_ab)
);
alter table employee_urlaubsanspruch enable row level security;

-- Sonderzahlungen und besondere Lohnbestandteile je Monat
create table if not exists employee_sonderzahlungen (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  art text not null,
  bezeichnung text,
  betrag numeric(10,2) check (betrag is null or betrag > 0),
  monat text not null check (monat ~ '^\d{4}-\d{2}$'),
  notiz text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table employee_sonderzahlungen enable row level security;
create index if not exists idx_employee_sonderzahlungen_employee on employee_sonderzahlungen(employee_id, monat);
