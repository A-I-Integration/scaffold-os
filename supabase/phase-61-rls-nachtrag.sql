-- Phase 61: RLS als Sicherheitsnetz für die 13 Tabellen, die es bisher
-- nicht hatten (per Skript gegen alle CREATE TABLE-Anweisungen der
-- bisherigen Migrationen geprüft).
--
-- WICHTIG zum Verständnis: Der service_role_key, den ALLE API-Routen
-- dieser App nutzen, umgeht RLS immer automatisch – unabhängig davon,
-- welche Policies existieren. Diese Migration ändert daher NICHTS am
-- normalen Verhalten der App. Sie schließt nur eine zusätzliche
-- Absicherung: Sollte jemals der anon/authenticated-Schlüssel direkt
-- (z. B. versehentlich im Frontend) verwendet werden, sind diese
-- Tabellen dann NICHT mehr offen einsehbar/änderbar, sondern
-- vollständig gesperrt (wie bei der bestehenden tenants-Tabelle schon
-- gehandhabt).
--
-- Bewusst OHNE eigene Policies für anon/authenticated – das wäre der
-- nächste, separate Schritt, falls die App irgendwann direkt (ohne
-- API-Route) auf einzelne Tabellen zugreifen soll.

alter table public.customer_contacts enable row level security;
alter table public.delivery_note_counters enable row level security;
alter table public.delivery_notes enable row level security;
alter table public.email_log enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.invoice_freigabe_override enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.kolonnen enable row level security;
alter table public.project_access_tokens enable row level security;
alter table public.project_assignments enable row level security;
alter table public.project_events enable row level security;
alter table public.project_versions enable row level security;
alter table public.taeglicher_einsatz enable row level security;
