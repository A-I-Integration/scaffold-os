-- Phase 90: Lohnabrechnungen im Mitarbeiter-Bereich
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar)
--
-- Anders als bei "project-media" (Phase 8) ist dieser Bucket bewusst
-- NICHT public und bekommt KEINE Policies für "authenticated" – Lohn-
-- abrechnungen sind sensible Daten. Der Zugriff läuft ausschließlich
-- über die API-Routen (Service Role Key, umgeht RLS), die vorher
-- prüfen: admin/disponent ODER der eigene Mitarbeiter-Datensatz
-- (gleiches Muster wie requireOwnEmployeeOrAdmin() bei time-entries).

-- 1) Privater Storage-Bucket für die hochgeladenen PDFs
insert into storage.buckets (id, name, public)
values ('payroll-documents', 'payroll-documents', false)
on conflict (id) do update set public = false;

-- 2) Tabelle: eine Zeile pro Mitarbeiter + Monat
create table if not exists payroll_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'), -- 'YYYY-MM'
  file_path text not null,   -- Pfad im Bucket "payroll-documents"
  file_name text not null,   -- Original-Dateiname (für Download/E-Mail-Anhang)
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  sent_at timestamptz,       -- zuletzt vom Mitarbeiter per E-Mail versendet
  unique (employee_id, month)
);

-- RLS aktiv, aber bewusst OHNE Policy für "authenticated" – siehe oben.
alter table payroll_documents enable row level security;

create index if not exists idx_payroll_documents_employee on payroll_documents(employee_id);
