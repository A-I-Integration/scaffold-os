-- Test für phase-111: als anon und als eingeloggter Mitarbeiter gegen die echten Policies.
-- Voraussetzung: kunden-schema.sql geladen, Rollen anon/authenticated/service_role mit Grants wie bei Supabase.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','ma@x.de'),('22222222-2222-4222-8222-222222222222','chef@x.de');
insert into public.profiles(id,email,role,full_name) values
  ('11111111-1111-4111-8111-111111111111','ma@x.de','mitarbeiter','Mitarbeiter'),
  ('22222222-2222-4222-8222-222222222222','chef@x.de','admin','Chef');
insert into public.customers(name) values ('Kunde A');
insert into public.projects(name) values ('Baustelle 1');

create temp table ergebnis(k text, ok boolean);
grant all on ergebnis to anon, authenticated;

-- ===== anon (ohne Login) =====
set local role anon;
insert into ergebnis select 'anon sieht keine Profile', (select count(*) from public.profiles) = 0;
insert into ergebnis select 'anon sieht keine Baustellen', (select count(*) from public.projects) = 0;
insert into ergebnis select 'anon sieht keine Kunden', (select count(*) from public.customers) = 0;
do $$ begin
  begin insert into public.profiles(id,email,role) values (gen_random_uuid(),'x@x.de','admin'); insert into ergebnis values ('anon darf kein Profil anlegen', false);
  exception when others then insert into ergebnis values ('anon darf kein Profil anlegen', true); end;
end $$;
reset role;

-- ===== eingeloggter Mitarbeiter =====
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true),
       set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true) \gset
insert into ergebnis select 'Mitarbeiter sieht keine Kunden direkt', (select count(*) from public.customers) = 0;
insert into ergebnis select 'Mitarbeiter liest eigenes Profil', (select count(*) from public.profiles where id = auth.uid()) = 1;
insert into ergebnis select 'Mitarbeiter sieht Baustellen weiterhin (Server-Aktionen)', (select count(*) from public.projects) = 1;
do $$ begin
  begin update public.profiles set role = 'admin' where id = auth.uid(); insert into ergebnis values ('Mitarbeiter kann sich NICHT zum Admin machen', false);
  exception when insufficient_privilege then insert into ergebnis values ('Mitarbeiter kann sich NICHT zum Admin machen', true); end;
end $$;
update public.profiles set full_name = 'Neuer Name' where id = auth.uid();
insert into ergebnis select 'Mitarbeiter darf den eigenen Namen ändern', (select full_name from public.profiles where id = auth.uid()) = 'Neuer Name';
update public.profiles set full_name = 'Chef gekapert' where id = '22222222-2222-4222-8222-222222222222';
reset role;
insert into ergebnis select 'fremdes Profil bleibt unverändert', (select full_name from public.profiles where id = '22222222-2222-4222-8222-222222222222') = 'Chef';
insert into ergebnis select 'Rolle des Mitarbeiters unverändert', (select role from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'mitarbeiter';

-- ===== keine offene "alles erlaubt"-Policy mehr auf den API-Tabellen =====
insert into ergebnis select 'keine offene Policy auf API-Tabellen', not exists (
  select 1 from pg_policies where schemaname='public'
    and tablename in ('invoices','customers','time_entries','company_settings','vehicles','tours','tour_stops','gps_tracking','drivers')
    and permissive='PERMISSIVE' and (qual='true' or with_check='true') and roles <> '{authenticated}'::name[]
) and not exists (
  select 1 from pg_policies where schemaname='public'
    and tablename in ('invoices','customers','time_entries','company_settings','vehicles','tours','tour_stops','gps_tracking')
    and permissive='PERMISSIVE' and (qual='true' or with_check='true'));
insert into ergebnis select 'keine Policy für "public" auf Tabellen mit Nutzer-Zugriff', not exists (
  select 1 from pg_policies where schemaname='public'
    and tablename in ('projects','employees','employee_skills','absences','inventory','inventory_transactions','site_stock','tour_plans','tour_assignments','transport_orders','profiles')
    and roles = '{public}');

select k, case when ok then 'OK' else 'FEHLER' end as status from ergebnis order by ok, k;
do $$ begin if exists (select 1 from ergebnis where not ok) then raise exception 'phase-111 Test fehlgeschlagen'; end if; end $$;
rollback;
