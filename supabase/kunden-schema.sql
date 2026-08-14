-- ============================================================
-- SCAFFOLD OS – KUNDEN-SCHEMA (für neue Kunden-Installationen)
-- ============================================================
--
-- !!! PLACEHOLDER_NICHT_PRODUKTIV !!!
--
-- Diese Datei enthält aktuell NUR die Phasen 4–9 aus dem Repo.
-- Das Basis-Schema (profiles, projects, employees, Inventory,
-- Touren-Grundtabellen etc.) FEHLT HIER NOCH.
--
-- Die Provisionierung verweigert den Lauf, solange dieser
-- Platzhalter drin ist (Schutz gegen kaputte Kunden-DBs).
-- ============================================================

-- ─── Fahrzeuge ───
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  license_plate text,
  is_active boolean DEFAULT true,
  last_gps_lat double precision,
  last_gps_lng double precision,
  last_gps_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ─── Fahrer ───
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ─── Touren ───
CREATE TABLE IF NOT EXISTS tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id),
  driver_id uuid REFERENCES drivers(id),
  planned_date date NOT NULL,
  planned_start_time text,
  status text DEFAULT 'planned',
  total_weight_kg numeric,
  route_data jsonb,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── Tour-Stopps ───
CREATE TABLE IF NOT EXISTS tour_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid REFERENCES tours(id) ON DELETE CASCADE,
  transport_order_id uuid REFERENCES transport_orders(id),
  project_id uuid,
  stop_order integer NOT NULL,
  address text,
  status text DEFAULT 'pending',
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ─── GPS-Tracking ───
CREATE TABLE IF NOT EXISTS gps_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id),
  driver_id uuid REFERENCES drivers(id),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  battery_level double precision,
  created_at timestamptz DEFAULT now()
);

-- ─── Indizes ───
CREATE INDEX IF NOT EXISTS idx_tours_planned_date ON tours(planned_date);
CREATE INDEX IF NOT EXISTS idx_tour_stops_tour ON tour_stops(tour_id);
CREATE INDEX IF NOT EXISTS idx_gps_vehicle_time ON 
gps_tracking(vehicle_id, created_at DESC);

-- ─── RLS ───
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicles_authenticated_all" ON vehicles;
CREATE POLICY "vehicles_authenticated_all" ON vehicles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "drivers_authenticated_all" ON drivers;
CREATE POLICY "drivers_authenticated_all" ON drivers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tours_authenticated_all" ON tours;
CREATE POLICY "tours_authenticated_all" ON tours
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tour_stops_authenticated_all" ON tour_stops;
CREATE POLICY "tour_stops_authenticated_all" ON tour_stops
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gps_tracking_authenticated_all" ON gps_tracking;
CREATE POLICY "gps_tracking_authenticated_all" ON gps_tracking
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Start-Daten ───
INSERT INTO vehicles (name, license_plate)
SELECT * FROM (VALUES
  ('Mercedes Sprinter 1', 'GER-US 1001'),
  ('Mercedes Sprinter 2', 'GER-US 1002')
) AS v(name, license_plate)
WHERE NOT EXISTS (SELECT 1 FROM vehicles);

INSERT INTO drivers (name)
SELECT * FROM (VALUES
  ('Fahrer 1'),
  ('Fahrer 2')
) AS d(name)
WHERE NOT EXISTS (SELECT 1 FROM drivers);

-- ─── PHASE 5: Zeiterfassung ───
CREATE TABLE IF NOT EXISTS time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  tour_id uuid,
  project_id uuid,
  work_date date NOT NULL,
  start_time timestamptz,
  end_time timestamptz,
  hours numeric(6,2),
  note text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date ON 
time_entries(employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(work_date 
DESC);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_entries_authenticated_all" ON time_entries;
CREATE POLICY "time_entries_authenticated_all" ON time_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── PHASE 6: Rollen-System + Verknüpfungen ───
DO $$
DECLARE
  coltype  text;
  enumname text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod), t.typname
    INTO coltype, enumname
  FROM pg_attribute a
  JOIN pg_class c     ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t      ON t.oid = a.atttypid
  WHERE n.nspname = 'public'
    AND c.relname = 'profiles'
    AND a.attname = 'role';

  IF coltype IS NULL THEN
    RAISE NOTICE 'profiles.role nicht gefunden – bitte melden!';
  ELSIF coltype IN ('text', 'character varying') THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS 
profiles_role_check;
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin', 'disponent', 'bauleiter', 'mitarbeiter', 
'lager'));
  ELSE
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enumname, 
'mitarbeiter');
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enumname, 
'lager');
  END IF;
END $$;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id);
CREATE INDEX IF NOT EXISTS idx_drivers_employee_id ON 
drivers(employee_id);

-- ─── PHASE 7: Pausen ───
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 0;

-- ─── PHASE 8: Storage-Bucket project-media ───
insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', true)
on conflict (id) do update set public = true;

drop policy if exists "project_media_select" on storage.objects;
create policy "project_media_select"
on storage.objects for select to authenticated
using (bucket_id = 'project-media');

drop policy if exists "project_media_insert" on storage.objects;
create policy "project_media_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'project-media');

drop policy if exists "project_media_update" on storage.objects;
create policy "project_media_update"
on storage.objects for update to authenticated
using (bucket_id = 'project-media');

drop policy if exists "project_media_delete" on storage.objects;
create policy "project_media_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'project-media');

alter table project_media enable row level security;

drop policy if exists "project_media_table_select" on project_media;
create policy "project_media_table_select"
on project_media for select to authenticated
using (true);

drop policy if exists "project_media_table_insert" on project_media;
create policy "project_media_table_insert"
on project_media for insert to authenticated
with check (true);

drop policy if exists "project_media_table_update" on project_media;
create policy "project_media_table_update"
on project_media for update to authenticated
using (true);

drop policy if exists "project_media_table_delete" on project_media;
create policy "project_media_table_delete"
on project_media for delete to authenticated
using (true);

-- ─── PHASE 9: project_media.project_id darf leer sein ───
alter table project_media alter column project_id drop not null;
