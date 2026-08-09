-- ============================================================
-- SCAFFOLD OS – PHASE 4: Touren, Fahrzeuge, Fahrer, GPS
-- In Supabase ausführen: SQL Editor → New query → einfügen → Run
-- Idempotent: kann mehrfach ausgeführt werden (IF NOT EXISTS).
-- Spalten sind exakt aus den API-Routen abgeleitet
-- (app/api/tours, tour-stops, vehicles, drivers, gps).
--
-- VORAUSSETZUNG: Die Tabellen transport_orders und inventory
-- existieren bereits (Lager-Phase). Die Fahrer-App und die
-- Touren-API verknüpfen sich per Foreign Key darauf.
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
  status text DEFAULT 'planned',        -- planned | in_progress | completed | cancelled
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
  status text DEFAULT 'pending',        -- pending | arrived | completed | skipped
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
CREATE INDEX IF NOT EXISTS idx_gps_vehicle_time ON gps_tracking(vehicle_id, created_at DESC);

-- ─── RLS (Muster: DROP IF EXISTS + CREATE) ───
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

-- ─── Start-Daten (gerne anpassen: eure echten Fahrzeuge/Fahrer) ───
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

-- ─── Kontrolle ───
SELECT 'vehicles' AS tabelle, count(*) FROM vehicles
UNION ALL SELECT 'drivers', count(*) FROM drivers
UNION ALL SELECT 'tours', count(*) FROM tours
UNION ALL SELECT 'tour_stops', count(*) FROM tour_stops
UNION ALL SELECT 'gps_tracking', count(*) FROM gps_tracking;
