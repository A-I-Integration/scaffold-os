-- Phase 134: Land, Ausweisdokument (Art + Gültigkeit), Reisepass-Gültigkeit und Erinnerungs-Protokoll
-- Einmalig im Supabase SQL-Editor ausführen (idempotent). Voraussetzung: Phase 133.

alter table employee_personal add column if not exists land text;
alter table employee_personal add column if not exists ausweisart text
  check (ausweisart in ('personalausweis','reisepass','aufenthaltstitel','duldung'));
alter table employee_personal add column if not exists ausweis_gueltig_bis date;
alter table employee_personal add column if not exists reisepass_gueltig_bis date;

-- Welche Erinnerung (je Frist und Ablaufdatum) schon per E-Mail verschickt wurde
create table if not exists personal_erinnerungen (
  schluessel text not null,
  gueltig_bis date not null,
  gesendet_am timestamptz not null default now(),
  primary key (schluessel, gueltig_bis)
);
alter table personal_erinnerungen enable row level security;
