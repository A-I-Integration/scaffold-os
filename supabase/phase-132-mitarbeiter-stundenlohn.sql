-- Phase 132: Stundenlohn je Mitarbeiter mit Gültigkeitsdatum (Bereich Personal)
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar).
--
-- Lohn ist sensibel: RLS ist aktiv, aber bewusst OHNE Policy für "authenticated". Der Zugriff läuft ausschließlich über die
-- API-Route /api/mitarbeiter-lohn (Service Role), die vorher prüft, dass der Aufrufer Admin ist (gleiches Muster wie payroll_documents).
-- Es gibt keine vorbelegten Werte: jeder Betrieb trägt seine eigenen Löhne ein. Änderungen sind neue Einträge ab einem Datum (Verlauf).

create table if not exists employee_wages (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  stundenlohn numeric(8,2) not null check (stundenlohn > 0 and stundenlohn <= 500),
  gueltig_ab date not null,
  notiz text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (employee_id, gueltig_ab)
);

alter table employee_wages enable row level security;

create index if not exists idx_employee_wages_employee on employee_wages(employee_id, gueltig_ab desc);
