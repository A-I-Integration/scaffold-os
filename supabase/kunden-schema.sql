-- ============================================================
-- SCAFFOLD OS – KUNDEN-SCHEMA (PRODUKTIV)
-- ============================================================
-- Echtes Schema, exportiert aus der Master-Instanz (pg_dump
-- --schema-only) und bereinigt:
--   * Supabase-Interna (auth, storage-Tabellen, realtime, vault,
--     extensions) entfernt – bringt jede neue Instanz selbst mit
--   * Master-Tabellen tenants + subscriptions entfernt – die
--     gehoeren NUR in die Master-Datenbank
--   * Storage-Policies + Bucket project-media angehaengt
-- Idempotent gedacht: auf frischer Instanz einmal ausfuehren.
-- ============================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

--
-- Name: absences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.absences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    employee_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'approved'::text,
    reason text,
    certificate_uploaded boolean DEFAULT false,
    created_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone
);

--
-- Name: drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    profile_id uuid,
    name text NOT NULL,
    phone text,
    license_class text DEFAULT 'C'::text,
    license_expires date,
    status text DEFAULT 'available'::text,
    current_vehicle_id uuid,
    is_active boolean DEFAULT true,
    employee_id uuid
);

--
-- Name: employee_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    employee_id uuid NOT NULL,
    skill_name text NOT NULL,
    level text DEFAULT 'basic'::text,
    certified_until date,
    certificate_number text
);

--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    role text DEFAULT 'monteur'::text NOT NULL,
    status text DEFAULT 'active'::text,
    weekly_hours integer DEFAULT 40,
    hourly_rate numeric(10,2) DEFAULT 0,
    drivers_license text,
    license_expires date,
    home_address text,
    home_lat numeric(10,8),
    home_lng numeric(11,8),
    notes text,
    created_by uuid,
    updated_by uuid,
    user_id uuid
);

--
-- Name: gps_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gps_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    vehicle_id uuid,
    driver_id uuid,
    lat numeric(10,8) NOT NULL,
    lng numeric(11,8) NOT NULL,
    accuracy numeric(6,2),
    speed numeric(6,2),
    heading numeric(5,2),
    battery_level integer
);

--
-- Name: inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sku text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    quantity integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 10 NOT NULL,
    reorder_point integer DEFAULT 20 NOT NULL,
    unit text DEFAULT 'Stk'::text NOT NULL,
    unit_price numeric(10,2) DEFAULT 0,
    supplier text,
    supplier_lead_time integer DEFAULT 7,
    location_in_warehouse text,
    barcode text,
    is_active boolean DEFAULT true,
    created_by uuid,
    updated_by uuid
);

--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    inventory_id uuid NOT NULL,
    project_id uuid,
    type text NOT NULL,
    quantity integer NOT NULL,
    reason text,
    reference_type text,
    reference_id uuid,
    created_by uuid
);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role text NOT NULL,
    company text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'disponent'::text, 'bauleiter'::text, 'mitarbeiter'::text, 'lager'::text])))
);

--
-- Name: project_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id text,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    uploaded_by uuid,
    session_id text,
    metadata jsonb DEFAULT '{}'::jsonb
);

--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    data jsonb,
    user_id uuid DEFAULT gen_random_uuid(),
    adresse text,
    status text DEFAULT 'active'::text
);

--
-- Name: site_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    inventory_id uuid NOT NULL,
    project_id uuid NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    reserved_quantity integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 5 NOT NULL,
    status text DEFAULT 'ok'::text,
    last_counted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid
);

--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    tour_id uuid,
    project_id uuid,
    work_date date NOT NULL,
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    hours numeric(6,2),
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    break_minutes integer DEFAULT 0 NOT NULL
);

--
-- Name: COLUMN time_entries.break_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.time_entries.break_minutes IS 'Abgezogene Pause in Minuten (automatisch: 30 ab 6h, 45 ab 9h; oder manuell korrigiert)';

--
-- Name: tour_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tour_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    role_in_tour text DEFAULT 'worker'::text,
    confirmed boolean DEFAULT false,
    confirmed_at timestamp with time zone
);

--
-- Name: tour_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    project_id uuid,
    transport_order_id uuid,
    planned_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    status text DEFAULT 'planned'::text,
    vehicle_id text,
    is_optimized boolean DEFAULT false,
    optimization_notes text,
    created_by uuid,
    updated_by uuid
);

--
-- Name: tour_stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_stops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tour_id uuid,
    transport_order_id uuid,
    project_id uuid,
    stop_order integer NOT NULL,
    address text NOT NULL,
    lat numeric(10,8),
    lng numeric(11,8),
    estimated_arrival timestamp with time zone,
    actual_arrival timestamp with time zone,
    status text DEFAULT 'pending'::text,
    notes text
);

--
-- Name: tours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name text NOT NULL,
    vehicle_id uuid,
    driver_id uuid,
    status text DEFAULT 'planned'::text,
    planned_date date,
    planned_start_time time without time zone,
    estimated_duration_min integer,
    total_distance_km numeric(8,2),
    total_weight_kg integer DEFAULT 0,
    route_optimized boolean DEFAULT false,
    route_data jsonb,
    notes text,
    completed_at timestamp with time zone
);

--
-- Name: transport_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    inventory_id uuid NOT NULL,
    from_project_id uuid,
    to_project_id uuid NOT NULL,
    quantity integer NOT NULL,
    status text DEFAULT 'pending'::text,
    priority text DEFAULT 'normal'::text,
    is_optimized boolean DEFAULT false,
    optimization_reason text,
    empty_run_saved boolean DEFAULT false,
    vehicle_id text,
    driver_id uuid,
    planned_date date,
    planned_time time without time zone,
    completed_at timestamp with time zone,
    notes text,
    created_by uuid,
    updated_by uuid
);

--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name text NOT NULL,
    license_plate text NOT NULL,
    type text DEFAULT 'transporter'::text,
    capacity_kg integer DEFAULT 1000,
    volume_m3 numeric(5,2) DEFAULT 15.0,
    fuel_type text DEFAULT 'diesel'::text,
    status text DEFAULT 'available'::text,
    current_location text,
    last_gps_lat numeric(10,8),
    last_gps_lng numeric(11,8),
    last_gps_at timestamp with time zone,
    notes text,
    is_active boolean DEFAULT true
);

--
-- Name: absences absences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absences
    ADD CONSTRAINT absences_pkey PRIMARY KEY (id);

--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);

--
-- Name: employee_skills employee_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_skills
    ADD CONSTRAINT employee_skills_pkey PRIMARY KEY (id);

--
-- Name: employees employees_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_email_key UNIQUE (email);

--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);

--
-- Name: gps_tracking gps_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gps_tracking
    ADD CONSTRAINT gps_tracking_pkey PRIMARY KEY (id);

--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);

--
-- Name: inventory inventory_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_sku_key UNIQUE (sku);

--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: project_media project_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_media
    ADD CONSTRAINT project_media_pkey PRIMARY KEY (id);

--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

--
-- Name: site_stock site_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_stock
    ADD CONSTRAINT site_stock_pkey PRIMARY KEY (id);

--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);

--
-- Name: tour_assignments tour_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_assignments
    ADD CONSTRAINT tour_assignments_pkey PRIMARY KEY (id);

--
-- Name: tour_assignments tour_assignments_tour_id_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_assignments
    ADD CONSTRAINT tour_assignments_tour_id_employee_id_key UNIQUE (tour_id, employee_id);

--
-- Name: tour_plans tour_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_plans
    ADD CONSTRAINT tour_plans_pkey PRIMARY KEY (id);

--
-- Name: tour_stops tour_stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_stops
    ADD CONSTRAINT tour_stops_pkey PRIMARY KEY (id);

--
-- Name: tours tours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_pkey PRIMARY KEY (id);

--
-- Name: transport_orders transport_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_orders
    ADD CONSTRAINT transport_orders_pkey PRIMARY KEY (id);

--
-- Name: vehicles vehicles_license_plate_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_license_plate_key UNIQUE (license_plate);

--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);

--
-- Name: idx_absences_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_absences_dates ON public.absences USING btree (start_date, end_date);

--
-- Name: idx_absences_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_absences_employee ON public.absences USING btree (employee_id);

--
-- Name: idx_absences_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_absences_type ON public.absences USING btree (type);

--
-- Name: idx_drivers_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_employee_id ON public.drivers USING btree (employee_id);

--
-- Name: idx_employee_skills_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_skills_employee ON public.employee_skills USING btree (employee_id);

--
-- Name: idx_employees_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_role ON public.employees USING btree (role);

--
-- Name: idx_employees_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_status ON public.employees USING btree (status);

--
-- Name: idx_employees_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_user_id ON public.employees USING btree (user_id);

--
-- Name: idx_gps_vehicle_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gps_vehicle_time ON public.gps_tracking USING btree (vehicle_id, created_at DESC);

--
-- Name: idx_inventory_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_category ON public.inventory USING btree (category);

--
-- Name: idx_inventory_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_sku ON public.inventory USING btree (sku);

--
-- Name: idx_inventory_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_status ON public.inventory USING btree (is_active);

--
-- Name: idx_project_media_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_media_session ON public.project_media USING btree (session_id) WHERE (project_id IS NULL);

--
-- Name: idx_site_stock_inventory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_stock_inventory ON public.site_stock USING btree (inventory_id);

--
-- Name: idx_site_stock_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_stock_project ON public.site_stock USING btree (project_id);

--
-- Name: idx_time_entries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_date ON public.time_entries USING btree (work_date DESC);

--
-- Name: idx_time_entries_employee_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_employee_date ON public.time_entries USING btree (employee_id, work_date DESC);

--
-- Name: idx_tour_assignments_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_assignments_employee ON public.tour_assignments USING btree (employee_id);

--
-- Name: idx_tour_assignments_tour; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_assignments_tour ON public.tour_assignments USING btree (tour_id);

--
-- Name: idx_tour_plans_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_plans_date ON public.tour_plans USING btree (planned_date);

--
-- Name: idx_tour_plans_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_plans_project ON public.tour_plans USING btree (project_id);

--
-- Name: idx_tour_plans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_plans_status ON public.tour_plans USING btree (status);

--
-- Name: idx_tour_stops_tour; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_stops_tour ON public.tour_stops USING btree (tour_id);

--
-- Name: idx_tours_planned_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tours_planned_date ON public.tours USING btree (planned_date);

--
-- Name: idx_transactions_inventory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_inventory ON public.inventory_transactions USING btree (inventory_id);

--
-- Name: idx_transactions_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_project ON public.inventory_transactions USING btree (project_id);

--
-- Name: idx_transport_orders_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transport_orders_date ON public.transport_orders USING btree (planned_date);

--
-- Name: idx_transport_orders_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transport_orders_from ON public.transport_orders USING btree (from_project_id);

--
-- Name: idx_transport_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transport_orders_status ON public.transport_orders USING btree (status);

--
-- Name: idx_transport_orders_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transport_orders_to ON public.transport_orders USING btree (to_project_id);

--
-- Name: absences update_absences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_absences_updated_at BEFORE UPDATE ON public.absences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: employees update_employees_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: inventory update_inventory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: site_stock update_site_stock_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_site_stock_updated_at BEFORE UPDATE ON public.site_stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: tour_plans update_tour_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tour_plans_updated_at BEFORE UPDATE ON public.tour_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: transport_orders update_transport_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_transport_orders_updated_at BEFORE UPDATE ON public.transport_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: absences absences_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absences
    ADD CONSTRAINT absences_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);

--
-- Name: absences absences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absences
    ADD CONSTRAINT absences_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: absences absences_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absences
    ADD CONSTRAINT absences_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

--
-- Name: drivers drivers_current_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_current_vehicle_id_fkey FOREIGN KEY (current_vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

--
-- Name: drivers drivers_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);

--
-- Name: drivers drivers_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

--
-- Name: employee_skills employee_skills_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_skills
    ADD CONSTRAINT employee_skills_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

--
-- Name: employees employees_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: employees employees_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

--
-- Name: employees employees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

--
-- Name: gps_tracking gps_tracking_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gps_tracking
    ADD CONSTRAINT gps_tracking_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;

--
-- Name: gps_tracking gps_tracking_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gps_tracking
    ADD CONSTRAINT gps_tracking_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

--
-- Name: inventory inventory_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: inventory_transactions inventory_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: inventory_transactions inventory_transactions_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id);

--
-- Name: inventory_transactions inventory_transactions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: inventory inventory_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: project_media project_media_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_media
    ADD CONSTRAINT project_media_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);

--
-- Name: site_stock site_stock_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_stock
    ADD CONSTRAINT site_stock_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: site_stock site_stock_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_stock
    ADD CONSTRAINT site_stock_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE;

--
-- Name: site_stock site_stock_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_stock
    ADD CONSTRAINT site_stock_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

--
-- Name: site_stock site_stock_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_stock
    ADD CONSTRAINT site_stock_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

--
-- Name: time_entries time_entries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);

--
-- Name: tour_assignments tour_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_assignments
    ADD CONSTRAINT tour_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

--
-- Name: tour_assignments tour_assignments_tour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_assignments
    ADD CONSTRAINT tour_assignments_tour_id_fkey FOREIGN KEY (tour_id) REFERENCES public.tour_plans(id) ON DELETE CASCADE;

--
-- Name: tour_plans tour_plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_plans
    ADD CONSTRAINT tour_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: tour_plans tour_plans_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_plans
    ADD CONSTRAINT tour_plans_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

--
-- Name: tour_plans tour_plans_transport_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_plans
    ADD CONSTRAINT tour_plans_transport_order_id_fkey FOREIGN KEY (transport_order_id) REFERENCES public.transport_orders(id) ON DELETE SET NULL;

--
-- Name: tour_plans tour_plans_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_plans
    ADD CONSTRAINT tour_plans_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

--
-- Name: tour_stops tour_stops_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_stops
    ADD CONSTRAINT tour_stops_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

--
-- Name: tour_stops tour_stops_tour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_stops
    ADD CONSTRAINT tour_stops_tour_id_fkey FOREIGN KEY (tour_id) REFERENCES public.tours(id) ON DELETE CASCADE;

--
-- Name: tour_stops tour_stops_transport_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_stops
    ADD CONSTRAINT tour_stops_transport_order_id_fkey FOREIGN KEY (transport_order_id) REFERENCES public.transport_orders(id) ON DELETE SET NULL;

--
-- Name: tours tours_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;

--
-- Name: tours tours_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

--
-- Name: transport_orders transport_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_orders
    ADD CONSTRAINT transport_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: transport_orders transport_orders_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_orders
    ADD CONSTRAINT transport_orders_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id);

--
-- Name: transport_orders transport_orders_from_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_orders
    ADD CONSTRAINT transport_orders_from_project_id_fkey FOREIGN KEY (from_project_id) REFERENCES public.projects(id);

--
-- Name: transport_orders transport_orders_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_orders
    ADD CONSTRAINT transport_orders_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id);

--
-- Name: transport_orders transport_orders_to_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_orders
    ADD CONSTRAINT transport_orders_to_project_id_fkey FOREIGN KEY (to_project_id) REFERENCES public.projects(id);

--
-- Name: transport_orders transport_orders_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_orders
    ADD CONSTRAINT transport_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

--
-- Name: project_media Allow authenticated delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated delete" ON public.project_media FOR DELETE TO authenticated USING (true);

--
-- Name: project_media Allow authenticated insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated insert" ON public.project_media FOR INSERT TO authenticated WITH CHECK (true);

--
-- Name: project_media Allow authenticated read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read" ON public.project_media FOR SELECT TO authenticated USING (true);

--
-- Name: project_media Allow authenticated update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated update" ON public.project_media FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

--
-- Name: projects Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public.projects FOR INSERT WITH CHECK (true);

--
-- Name: projects Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.projects FOR SELECT USING (true);

--
-- Name: profiles Users can read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));

--
-- Name: absences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

--
-- Name: absences absences_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absences_delete_admin ON public.absences FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

--
-- Name: absences absences_insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absences_insert_all ON public.absences FOR INSERT WITH CHECK (true);

--
-- Name: absences absences_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absences_select_all ON public.absences FOR SELECT USING (true);

--
-- Name: absences absences_update_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absences_update_admin_disponent ON public.absences FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: tour_assignments assignments_delete_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_delete_admin_disponent ON public.tour_assignments FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: tour_assignments assignments_insert_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_insert_admin_disponent ON public.tour_assignments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: tour_assignments assignments_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_select_all ON public.tour_assignments FOR SELECT USING (true);

--
-- Name: tour_assignments assignments_update_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_update_admin_disponent ON public.tour_assignments FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: drivers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

--
-- Name: drivers drivers_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drivers_authenticated_all ON public.drivers TO authenticated USING (true) WITH CHECK (true);

--
-- Name: employee_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_delete_admin ON public.employees FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

--
-- Name: employees employees_insert_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_insert_admin_disponent ON public.employees FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: employees employees_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_select_all ON public.employees FOR SELECT USING (true);

--
-- Name: employees employees_update_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_update_admin_disponent ON public.employees FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: gps_tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gps_tracking ENABLE ROW LEVEL SECURITY;

--
-- Name: gps_tracking gps_tracking_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gps_tracking_authenticated_all ON public.gps_tracking TO authenticated USING (true) WITH CHECK (true);

--
-- Name: inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory inventory_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_delete_admin ON public.inventory FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

--
-- Name: inventory inventory_insert_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_insert_admin_disponent ON public.inventory FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: inventory inventory_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_select_all ON public.inventory FOR SELECT USING (true);

--
-- Name: inventory_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory inventory_update_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_update_admin_disponent ON public.inventory FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_delete_admin ON public.profiles FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = 'admin'::text)))));

--
-- Name: profiles profiles_insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_all ON public.profiles FOR INSERT WITH CHECK (true);

--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);

--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((auth.uid() = id));

--
-- Name: project_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_media ENABLE ROW LEVEL SECURITY;

--
-- Name: project_media project_media_table_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_media_table_delete ON public.project_media FOR DELETE TO authenticated USING (true);

--
-- Name: project_media project_media_table_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_media_table_insert ON public.project_media FOR INSERT TO authenticated WITH CHECK (true);

--
-- Name: project_media project_media_table_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_media_table_select ON public.project_media FOR SELECT TO authenticated USING (true);

--
-- Name: project_media project_media_table_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_media_table_update ON public.project_media FOR UPDATE TO authenticated USING (true);

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: site_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: site_stock site_stock_insert_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_stock_insert_admin_disponent ON public.site_stock FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: site_stock site_stock_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_stock_select_all ON public.site_stock FOR SELECT USING (true);

--
-- Name: site_stock site_stock_update_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_stock_update_all ON public.site_stock FOR UPDATE USING (true);

--
-- Name: employee_skills skills_delete_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_delete_admin_disponent ON public.employee_skills FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: employee_skills skills_insert_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_insert_admin_disponent ON public.employee_skills FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: employee_skills skills_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_select_all ON public.employee_skills FOR SELECT USING (true);

--
-- Name: employee_skills skills_update_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_update_admin_disponent ON public.employee_skills FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: time_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: time_entries time_entries_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY time_entries_authenticated_all ON public.time_entries TO authenticated USING (true) WITH CHECK (true);

--
-- Name: tour_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_stops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tour_stops ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_stops tour_stops_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_stops_authenticated_all ON public.tour_stops TO authenticated USING (true) WITH CHECK (true);

--
-- Name: tours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;

--
-- Name: tours tours_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tours_authenticated_all ON public.tours TO authenticated USING (true) WITH CHECK (true);

--
-- Name: tour_plans tours_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tours_delete_admin ON public.tour_plans FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

--
-- Name: tour_plans tours_insert_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tours_insert_admin_disponent ON public.tour_plans FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: tour_plans tours_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tours_select_all ON public.tour_plans FOR SELECT USING (true);

--
-- Name: tour_plans tours_update_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tours_update_admin_disponent ON public.tour_plans FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: inventory_transactions transactions_insert_system; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_insert_system ON public.inventory_transactions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: inventory_transactions transactions_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_select_all ON public.inventory_transactions FOR SELECT USING (true);

--
-- Name: transport_orders transport_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transport_delete_admin ON public.transport_orders FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

--
-- Name: transport_orders transport_insert_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transport_insert_admin_disponent ON public.transport_orders FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: transport_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transport_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: transport_orders transport_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transport_select_all ON public.transport_orders FOR SELECT USING (true);

--
-- Name: transport_orders transport_update_admin_disponent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transport_update_admin_disponent ON public.transport_orders FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'disponent'::text]))))));

--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicles vehicles_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vehicles_authenticated_all ON public.vehicles TO authenticated USING (true) WITH CHECK (true);

--
-- Name: objects Allow authenticated delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated delete" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'project-media'::text));

--
-- Name: objects Allow authenticated read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated read" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'project-media'::text));

--
-- Name: objects Allow authenticated update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated update" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'project-media'::text));

--
-- Name: objects Allow authenticated upload; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'project-media'::text));

--
-- Name: objects project_media_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY project_media_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'project-media'::text));

--
-- Name: objects project_media_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY project_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'project-media'::text));

--
-- Name: objects project_media_select; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY project_media_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'project-media'::text));

--
-- Name: objects project_media_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY project_media_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'project-media'::text));

-- ============================================================
-- Storage-Bucket project-media (Aufmaß-Fotos & LiDAR-Scans)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', true)
on conflict (id) do update set public = true;

-- ============================================================
-- PHASE 13: Rechnungsmodul (identisch zu phase-13-rechnungen.sql)
-- ============================================================
--
-- WICHTIG für die Master-Instanz:
--   Diese SQL muss auch in supabase/kunden-schema.sql eingefügt
--   werden, damit NEUE Kundeninstanzen das Rechnungsmodul haben.
-- ============================================================

-- ─── Rechnungsnummern-Zähler (pro Jahr fortlaufend) ───
CREATE TABLE IF NOT EXISTS invoice_counters (
  year int PRIMARY KEY,
  last_number int NOT NULL DEFAULT 0
);

-- ─── Funktion: nächste Rechnungsnummer (RE-JAHR-LAUFNUMMER) ───
CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  y int := extract(year from current_date)::int;
  n int;
BEGIN
  INSERT INTO invoice_counters (year, last_number)
  VALUES (y, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_number = invoice_counters.last_number + 1
  RETURNING last_number INTO n;

  RETURN 'RE-' || y || '-' || lpad(n::text, 4, '0');
END;
$$;

-- ─── Rechnungen ───
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  invoice_number text NOT NULL UNIQUE,
  project_id uuid REFERENCES projects(id),
  customer_name text NOT NULL,
  customer_address text,
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 19,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen', 'bezahlt', 'ueberfaellig', 'storniert')),
  invoice_date date NOT NULL DEFAULT current_date,
  due_date date,
  notes text
);

-- ─── Indizes ───
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);
CREATE INDEX IF NOT EXISTS invoices_project_idx ON invoices (project_id);
CREATE INDEX IF NOT EXISTS invoices_date_idx ON invoices (invoice_date);

-- ─── Row Level Security (Stil wie Phase 4: authenticated_all) ───
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_authenticated_all" ON invoices;
CREATE POLICY "invoices_authenticated_all" ON invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- PHASE 14: Firmenprofil (identisch zu phase-14-firmenprofil.sql)
-- ============================================================
-- ─── Firmenprofil (Singleton: genau eine Zeile) ───
CREATE TABLE IF NOT EXISTS company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  company_name text,
  street text,
  zip text,
  city text,
  phone text,
  email text,
  website text,
  steuer_nr text,
  ust_id text,
  bank_name text,
  iban text,
  bic text,
  depot_address text
);

-- Leere Startzeile anlegen (feste ID = Singleton)
INSERT INTO company_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─── RLS (Stil wie üblich: authenticated_all) ───
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_settings_authenticated_all" ON company_settings;
CREATE POLICY "company_settings_authenticated_all" ON company_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Firmen-Snapshot auf Rechnungen (GoBD) ───
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_snapshot jsonb;


-- ============================================================
-- PHASE 15: Produkt-Luecken (identisch zu phase-15-produktluecken.sql)
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_level int NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_type_check'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_invoice_type_check
      CHECK (invoice_type IN ('standard', 'abschlag', 'schluss'));
  END IF;
END $$;

-- ============================================================
-- PHASE 16: Onboarding-Assistent (identisch zu phase-16-onboarding.sql)
-- ============================================================
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;
