-- Phase 111: Zugriffsregeln (RLS) härten – Prüfung 4 (Rechte und Sicherheit)
--
-- Gefunden auf einer frischen Datenbank aus supabase/kunden-schema.sql:
--  1. profiles: jeder eingeloggte Nutzer durfte seine EIGENE Zeile ändern – auch die Spalte "role".
--     Ein Mitarbeiter konnte sich über die öffentliche Datenbank-Schnittstelle selbst zum Admin machen.
--     Dazu durfte jeder (auch ohne Login) neue Profile anlegen und alle Profile lesen.
--  2. invoices, customers, time_entries, company_settings, vehicles, tours, tour_stops, gps_tracking, drivers:
--     Policy "für jeden Eingeloggten alles erlaubt". Die App greift darauf nur über die API (Service-Schlüssel,
--     umgeht RLS) zu – die Policies umgingen also nur die Rollenprüfungen der API.
--  3. projects, employees, absences, inventory, site_stock, tour_plans, ... : Policies galten für "public"
--     und damit auch ohne Login (anon). Beispiel: Alle Baustellen samt Daten waren ohne Anmeldung lesbar,
--     der Baustellenbestand ohne Anmeldung änderbar.
--
-- Was bewusst NICHT geändert wird: Tabellen, die die App mit dem Nutzer-Schlüssel (RLS) benutzt
-- (lib/actions/*: employees, absences, inventory, site_stock, transport_orders, tour_plans ...) bleiben für
-- Eingeloggte so nutzbar wie bisher – nur der Zugriff OHNE Login entfällt.
-- Die API-Routen nutzen den Service-Schlüssel (umgeht RLS); an ihrem Verhalten ändert diese Migration nichts.
--
-- Mehrfach ausführbar. Prüfen vorher/nachher:
--   select tablename, policyname, roles, cmd from pg_policies where schemaname='public' and (qual='true' or with_check='true') order by 1,2;

-- 1) profiles: kein Anlegen/Lesen ohne Login, keine Selbst-Beförderung -----------------------------------
drop policy if exists profiles_insert_all on public.profiles;
drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

-- Eingeloggte dürfen Profile weiterhin lesen (Namen im Team); ändern nur die eigene Zeile und nur Name/Firma.
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
revoke update on public.profiles from anon, authenticated;
grant update (full_name, company) on public.profiles to authenticated;

-- 2) Tabellen, die nur die API (Service-Schlüssel) benutzt: "alles für jeden Eingeloggten" entfernen ------
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('invoices','customers','time_entries','company_settings','vehicles','tours','tour_stops','gps_tracking')
      and permissive = 'PERMISSIVE'
      and (qual = 'true' or with_check = 'true')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- drivers: lesen bleibt (lib/actions/employees.ts), Schreiben nur über die API
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'drivers' and permissive = 'PERMISSIVE' and (qual = 'true' or with_check = 'true')
  loop
    execute format('drop policy %I on public.drivers', r.policyname);
  end loop;
end $$;
drop policy if exists drivers_select_authenticated on public.drivers;
create policy drivers_select_authenticated on public.drivers for select to authenticated using (true);

-- 3) Tabellen mit Nutzer-Schlüssel-Zugriff: Policies gelten nur noch für Eingeloggte (nicht mehr für "public"/anon) ----
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('projects','employees','employee_skills','absences','inventory','inventory_transactions',
                        'site_stock','tour_plans','tour_assignments','transport_orders','profiles')
      and roles = '{public}'
  loop
    execute format('alter policy %I on public.%I to authenticated', r.policyname, r.tablename);
  end loop;
end $$;
