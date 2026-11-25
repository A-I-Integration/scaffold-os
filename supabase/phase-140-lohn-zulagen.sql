-- Phase 140: Lohn-Zulagen (Gutschein, Tankrabatt, Kilometergeld, Geburt/Geburtstag, Zulage) und Pfändung
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar). Voraussetzung: Phase 135.
-- RLS aktiv, bewusst OHNE Policy: Zugriff nur über die API (nur Chef).

-- Kilometergeld: gefahrene km und Satz (EUR je km) werden mit der Zahlung gespeichert
alter table employee_sonderzahlungen add column if not exists menge numeric(10,2);
alter table employee_sonderzahlungen add column if not exists satz numeric(8,4);

-- Betriebssätze mit Gültig-ab (derzeit: Kilometergeld, EUR je km). Kein vorbelegter Wert: der Betrieb legt ihn fest.
create table if not exists lohn_saetze (
  schluessel text not null,
  wert numeric(10,4) not null check (wert >= 0),
  gueltig_ab date not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  primary key (schluessel, gueltig_ab)
);
alter table lohn_saetze enable row level security;

-- Pfändungen je Mitarbeiter (mehrere Gläubiger, Reihenfolge nach Rang)
create table if not exists employee_pfaendungen (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  glaeubiger text not null,
  aktenzeichen text,
  rang int not null default 1 check (rang >= 1),
  unterhaltspersonen int not null default 0 check (unterhaltspersonen between 0 and 5),
  gueltig_ab date not null,
  gueltig_bis date,
  forderung_offen numeric(12,2) check (forderung_offen is null or forderung_offen >= 0),
  notiz text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (gueltig_bis is null or gueltig_bis >= gueltig_ab)
);
alter table employee_pfaendungen enable row level security;
create index if not exists idx_employee_pfaendungen_employee on employee_pfaendungen(employee_id);

-- Netto je Monat, aus dem der pfändbare Betrag berechnet wird (ggf. mit Handkorrektur)
create table if not exists pfaendung_monate (
  employee_id uuid not null references employees(id) on delete cascade,
  monat text not null check (monat ~ '^\d{4}-\d{2}$'),
  netto numeric(10,2) not null check (netto >= 0),
  betrag_manuell numeric(10,2) check (betrag_manuell is null or betrag_manuell >= 0),
  begruendung text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (employee_id, monat)
);
alter table pfaendung_monate enable row level security;

-- Pfändungsfreigrenzen (§ 850c ZPO), monatlich, mit Gültig-ab (jeweils zum 1. Juli neu)
create table if not exists pfaendung_grenzen (
  gueltig_ab date primary key,
  grundbetrag numeric(10,2) not null,
  erhoehung_erste numeric(10,2) not null,
  erhoehung_weitere numeric(10,2) not null,
  obergrenze numeric(10,2) not null,
  bemerkung text
);
alter table pfaendung_grenzen enable row level security;
insert into pfaendung_grenzen (gueltig_ab, grundbetrag, erhoehung_erste, erhoehung_weitere, obergrenze, bemerkung) values
  ('2025-07-01', 1555.00, 585.23, 326.04, 4766.99, 'Pfändungsfreigrenzenbekanntmachung 2025'),
  ('2026-07-01', 1587.40, 597.42, 332.83, 4866.30, 'Pfändungsfreigrenzenbekanntmachung 2026')
on conflict (gueltig_ab) do nothing;
