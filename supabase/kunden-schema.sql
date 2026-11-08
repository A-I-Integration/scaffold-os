-- ============================================================
-- SCAFFOLD OS – KUNDEN-SCHEMA (PRODUKTIV)
-- ============================================================
-- Echtes Schema, exportiert aus der Master-Instanz (pg_dump
-- --schema-only --no-owner --no-privileges --schema=public) und bereinigt
-- mit scripts/kunden-schema-bereinigen.mjs (Stand 2026-11-08):
--   * Supabase-Interna (auth, storage-Tabellen, realtime, vault,
--     extensions) nicht enthalten – bringt jede neue Instanz selbst mit
--   * Master-Tabellen (tenants, subscriptions) entfernt – die
--     gehoeren NUR in die Master-Datenbank
--   * Storage-Policies + Bucket project-media angehaengt
-- Idempotent gedacht: auf frischer Instanz einmal ausfuehren.
-- ============================================================


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

--
-- Name: besucher_statistik(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.besucher_statistik(p_tage integer DEFAULT 30) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  WITH grenze AS (
    SELECT ((now() AT TIME ZONE 'Europe/Berlin')::date - (GREATEST(p_tage, 1) - 1)) AS ab
  ),
  b AS (
    SELECT * FROM besuche, grenze WHERE besuche.tag >= grenze.ab
  )
  SELECT jsonb_build_object(
    'tage', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.tag)
      FROM (
        SELECT tag, count(*) AS aufrufe, count(DISTINCT besucher) AS besucher
        FROM b GROUP BY tag
      ) t
    ), '[]'::jsonb),
    'seiten', COALESCE((
      SELECT jsonb_agg(s ORDER BY s.aufrufe DESC)
      FROM (
        SELECT pfad, count(*) AS aufrufe
        FROM b GROUP BY pfad ORDER BY count(*) DESC LIMIT 15
      ) s
    ), '[]'::jsonb),
    'quellen', COALESCE((
      SELECT jsonb_agg(q ORDER BY q.aufrufe DESC)
      FROM (
        SELECT COALESCE(quelle, 'Direkt / unbekannt') AS quelle, count(*) AS aufrufe
        FROM b GROUP BY 1 ORDER BY count(*) DESC LIMIT 15
      ) q
    ), '[]'::jsonb),
    'geraete', COALESCE((
      SELECT jsonb_agg(g ORDER BY g.aufrufe DESC)
      FROM (
        SELECT COALESCE(geraet, 'unbekannt') AS geraet, count(*) AS aufrufe
        FROM b GROUP BY 1
      ) g
    ), '[]'::jsonb)
  );
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    invoice_number text NOT NULL,
    project_id uuid,
    customer_name text NOT NULL,
    customer_address text,
    positions jsonb DEFAULT '[]'::jsonb NOT NULL,
    net_amount numeric(12,2) DEFAULT 0 NOT NULL,
    tax_rate numeric(5,2) DEFAULT 19 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    gross_amount numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'offen'::text NOT NULL,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    notes text,
    company_snapshot jsonb,
    reminder_level integer DEFAULT 0 NOT NULL,
    invoice_type text DEFAULT 'standard'::text NOT NULL,
    reference_invoice_number text,
    customer_id uuid,
    paid_amount numeric(12,2) DEFAULT 0 NOT NULL,
    geruest_nr text,
    leistungsdatum date,
    pruef_status text,
    geprueft_von text,
    geprueft_am timestamp with time zone,
    importiert boolean DEFAULT false NOT NULL,
    mahnung_pausiert boolean DEFAULT false NOT NULL,
    mahnung_pause_grund text,
    erinnerung_am date,
    CONSTRAINT invoices_invoice_type_check CHECK ((invoice_type = ANY (ARRAY['standard'::text, 'abschlag'::text, 'schluss'::text, 'gutschrift'::text]))),
    CONSTRAINT invoices_pruef_status_check CHECK (((pruef_status IS NULL) OR (pruef_status = ANY (ARRAY['akzeptiert'::text, 'aenderung'::text, 'abgelehnt'::text])))),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'bezahlt'::text, 'ueberfaellig'::text, 'storniert'::text])))
);

--
-- Name: COLUMN invoices.reference_invoice_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.reference_invoice_number IS 'Nur bei invoice_type = gutschrift: Rechnungsnummer, auf die sich die Gutschrift bezieht (informativ, keine FK).';

--
-- Name: COLUMN invoices.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.customer_id IS 'Echte Verknüpfung zum Kundenstamm (direkt oder über das verknüpfte Projekt übernommen).';

--
-- Name: COLUMN invoices.paid_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.paid_amount IS 'Bisher eingegangener Betrag (Summe aller Teilzahlungen). status bleibt "offen", solange paid_amount < gross_amount; "bezahlt" erst bei vollständigem Ausgleich.';

--
-- Name: create_invoice(text, uuid, uuid, text, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_invoice(p_prefix text, p_project_id uuid, p_customer_id uuid, p_customer_name text, p_customer_address text, p_positions jsonb, p_net_amount numeric, p_tax_rate numeric, p_tax_amount numeric, p_gross_amount numeric, p_invoice_date date, p_due_date date, p_notes text, p_company_snapshot jsonb, p_invoice_type text, p_reference_invoice_number text) RETURNS public.invoices
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_number text;
  v_row invoices;
BEGIN
  v_number := next_invoice_number(p_prefix);

  INSERT INTO invoices (
    invoice_number, project_id, customer_id, customer_name, customer_address,
    positions, net_amount, tax_rate, tax_amount, gross_amount, status,
    invoice_date, due_date, notes, company_snapshot, invoice_type,
    reference_invoice_number
  ) VALUES (
    v_number, p_project_id, p_customer_id, p_customer_name, p_customer_address,
    p_positions, p_net_amount, p_tax_rate, p_tax_amount, p_gross_amount, 'offen',
    p_invoice_date, p_due_date, p_notes, p_company_snapshot, p_invoice_type,
    p_reference_invoice_number
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

--
-- Name: create_invoice_as_new_version(uuid, text, uuid, uuid, text, text, jsonb, numeric, numeric, numeric, numeric, date, date, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_invoice_as_new_version(p_old_invoice_id uuid, p_prefix text, p_project_id uuid, p_customer_id uuid, p_customer_name text, p_customer_address text, p_positions jsonb, p_net_amount numeric, p_tax_rate numeric, p_tax_amount numeric, p_gross_amount numeric, p_invoice_date date, p_due_date date, p_notes text, p_company_snapshot jsonb, p_invoice_type text, p_reference_invoice_number text) RETURNS public.invoices
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_old_status text;
  v_old_notes text;
  v_new_row invoices;
BEGIN
  SELECT status, notes INTO v_old_status, v_old_notes
  FROM invoices
  WHERE id = p_old_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zu ersetzende Rechnung (id=%) wurde nicht gefunden.', p_old_invoice_id;
  END IF;

  IF v_old_status = 'storniert' THEN
    RAISE EXCEPTION 'Rechnung ist bereits storniert und kann nicht erneut ersetzt werden.';
  END IF;

  v_new_row := create_invoice(
    p_prefix, p_project_id, p_customer_id, p_customer_name, p_customer_address,
    p_positions, p_net_amount, p_tax_rate, p_tax_amount, p_gross_amount,
    p_invoice_date, p_due_date, p_notes, p_company_snapshot, p_invoice_type,
    p_reference_invoice_number
  );

  UPDATE invoices
  SET status = 'storniert',
      notes = trim(both E'\n' from
        coalesce(v_old_notes, '') || E'\n' ||
        'Ersetzt durch ' || v_new_row.invoice_number || ' am ' ||
        to_char(now(), 'DD.MM.YYYY') || '.'
      ),
      updated_at = now()
  WHERE id = p_old_invoice_id;

  RETURN v_new_row;
END;
$$;

--
-- Name: ki_jobs_cleanup(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ki_jobs_cleanup(alter_tage integer DEFAULT 30) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  geloescht int;
begin
  delete from public.ki_jobs
   where status in ('done', 'error')
     and fertig_am < now() - make_interval(days => alter_tage);
  get diagnostics geloescht = row_count;
  return geloescht;
end $$;

--
-- Name: next_delivery_note_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_delivery_note_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  y int := extract(year from current_date)::int;
  n int;
BEGIN
  INSERT INTO delivery_note_counters (year, last_number)
  VALUES (y, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_number = delivery_note_counters.last_number + 1
  RETURNING last_number INTO n;

  RETURN 'LS-' || y || '-' || lpad(n::text, 4, '0');
END;
$$;

--
-- Name: next_invoice_number(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_invoice_number(p_prefix text DEFAULT 'RE'::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  y int := extract(year from current_date)::int;
  n int;
BEGIN
  INSERT INTO invoice_counters (year, prefix, last_number)
  VALUES (y, p_prefix, 1)
  ON CONFLICT (year, prefix)
  DO UPDATE SET last_number = invoice_counters.last_number + 1
  RETURNING last_number INTO n;

  RETURN p_prefix || '-' || y || '-' || lpad(n::text, 4, '0');
END;
$$;

--
-- Name: touch_subscriptions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_subscriptions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

--
-- Name: abrechnung_m2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abrechnung_m2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    art text NOT NULL,
    name text NOT NULL,
    preis_m2 numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT abrechnung_m2_art_check CHECK ((art = ANY (ARRAY['grundpreis'::text, 'aufpreis'::text]))),
    CONSTRAINT abrechnung_m2_preis_m2_check CHECK (((preis_m2 >= (0)::numeric) AND (preis_m2 <= (10000)::numeric)))
);

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
-- Name: besuche; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.besuche (
    id bigint NOT NULL,
    tag date DEFAULT ((now() AT TIME ZONE 'Europe/Berlin'::text))::date NOT NULL,
    zeit timestamp with time zone DEFAULT now() NOT NULL,
    pfad text NOT NULL,
    besucher text NOT NULL,
    quelle text,
    geraet text,
    CONSTRAINT besuche_geraet_check CHECK ((geraet = ANY (ARRAY['desktop'::text, 'mobil'::text, 'tablet'::text])))
);

--
-- Name: besuche_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.besuche ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.besuche_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
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
    depot_address text,
    onboarding_done boolean DEFAULT false NOT NULL,
    calc_hourly_rate numeric(10,2) DEFAULT 65,
    calc_hours_per_sqm numeric(6,2) DEFAULT 2.0,
    calc_transport_per_kg numeric(10,2) DEFAULT 0.80,
    calc_transport_min numeric(10,2) DEFAULT 250,
    calc_trip_flat numeric(10,2) DEFAULT 0,
    calc_permit_low numeric(10,2) DEFAULT 250,
    calc_permit_high numeric(10,2) DEFAULT 450,
    calc_crane_day numeric(10,2) DEFAULT 850,
    mahnung_pauschale numeric(10,2) DEFAULT 5.00,
    mahnung_verzugszinssatz numeric(5,2) DEFAULT 10.52,
    preisliste_geruesttypen jsonb DEFAULT '[]'::jsonb,
    calc_festpreis_pro_m2 numeric(10,2),
    angebotene_geruesttypen jsonb,
    tour_standort_erfassen boolean DEFAULT true NOT NULL,
    tour_fahrt_dauer_min integer DEFAULT 180 NOT NULL,
    tour_letzter_start_min integer DEFAULT 900 NOT NULL,
    lv_firmenwerte jsonb,
    lv_standardpreise jsonb,
    mahnung_erinnerung_tage integer
);

--
-- Name: COLUMN company_settings.mahnung_pauschale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.mahnung_pauschale IS 'Pauschale je Mahnung in Euro (§ 288 Abs. 5 BGB, B2B – angemessene Höhe, Standard 5 €).';

--
-- Name: COLUMN company_settings.mahnung_verzugszinssatz; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.mahnung_verzugszinssatz IS 'Verzugszinssatz % p.a. = Basiszinssatz (§ 247 BGB) + 9 Prozentpunkte (B2B, § 288 Abs. 2 BGB). Ändert sich zum 1.1./1.7. – bitte halbjährlich in den Firmeneinstellungen aktualisieren.';

--
-- Name: COLUMN company_settings.calc_festpreis_pro_m2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.calc_festpreis_pro_m2 IS 'Optionaler Festpreis pro m2 fuer den Festpreis-Modus im Aufmaß (Schritt 6). Leer = KI-Kalkulation bleibt Standard.';

--
-- Name: COLUMN company_settings.tour_standort_erfassen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.tour_standort_erfassen IS 'true = Standort bei Touren erfassen (Standard); false = nur Uhrzeiten.';

--
-- Name: COLUMN company_settings.lv_firmenwerte; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.lv_firmenwerte IS 'LV-Dialog: Firmenwerte (Stundensaetze, Mietsatz, Zuschlag, Standzeit, MwSt. ...) als JSON.';

--
-- Name: COLUMN company_settings.lv_standardpreise; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_settings.lv_standardpreise IS 'LV: Standardpreise je Position, JSON {Positionsanfang: {ep, epJeWoche}}.';

--
-- Name: customer_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    name text NOT NULL,
    bezeichnung text,
    email text,
    phone text,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: TABLE customer_contacts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_contacts IS 'Mehrere Ansprechpartner pro Kunde (die customers-Tabelle selbst hat nur ein einzelnes Kontaktfeld für den Hauptkontakt).';

--
-- Name: customer_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    email_account_id uuid NOT NULL,
    imap_uid bigint NOT NULL,
    imap_mailbox text NOT NULL,
    richtung text NOT NULL,
    betreff text,
    von text,
    an text,
    datum timestamp with time zone,
    text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_emails_richtung_check CHECK ((richtung = ANY (ARRAY['eingehend'::text, 'ausgehend'::text])))
);

--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name text NOT NULL,
    contact_person text,
    email text,
    phone text,
    street text,
    zip text,
    city text,
    notes text,
    is_active boolean DEFAULT true,
    datev_konto text
);

--
-- Name: COLUMN customers.datev_konto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.datev_konto IS 'Optionale DATEV-Einzeldebitorenkontonummer (vom Steuerberater vergeben). Leer = Buchung läuft weiter über das Sammeldebitorenkonto im DATEV-Export.';

--
-- Name: delivery_note_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_note_counters (
    year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);

--
-- Name: delivery_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ls_number text NOT NULL,
    project_id uuid,
    customer_id uuid,
    customer_name text NOT NULL,
    customer_address text,
    type text NOT NULL,
    performed_date date DEFAULT CURRENT_DATE NOT NULL,
    materials jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    signed_by_name text,
    signature_data_url text,
    company_snapshot jsonb,
    CONSTRAINT delivery_notes_type_check CHECK ((type = ANY (ARRAY['aufbau'::text, 'abbau'::text])))
);

--
-- Name: TABLE delivery_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.delivery_notes IS 'Lieferscheine: bestätigen Auf-/Abbau vor der Rechnungsstellung, mit Materialliste und optionaler Kundenunterschrift.';

--
-- Name: demo_ip_sperre; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_ip_sperre (
    ip text NOT NULL,
    first_login_at timestamp with time zone DEFAULT now()
);

--
-- Name: TABLE demo_ip_sperre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.demo_ip_sperre IS 'Demo-Gate: pro Internet-Anschluss (IP) nur ein Demo-Login. first_login_at nur zur Nachvollziehbarkeit.';

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
-- Name: email_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    bezeichnung text,
    email_address text NOT NULL,
    imap_host text NOT NULL,
    imap_port integer NOT NULL,
    imap_secure boolean DEFAULT true NOT NULL,
    smtp_host text NOT NULL,
    smtp_port integer NOT NULL,
    smtp_secure boolean DEFAULT true NOT NULL,
    encrypted_password text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: email_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    invoice_number text,
    type text NOT NULL,
    to_email text NOT NULL,
    subject text NOT NULL,
    resend_id text,
    sent_at timestamp with time zone DEFAULT now(),
    body_html text,
    attachment_path text,
    attachment_name text,
    customer_id uuid,
    sent_by uuid,
    sent_from text,
    CONSTRAINT email_log_type_check CHECK ((type = ANY (ARRAY['angebot'::text, 'rechnung'::text, 'mahnung'::text, 'frei'::text])))
);

--
-- Name: TABLE email_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.email_log IS 'Protokoll ausgehender E-Mails (Angebot/Rechnung/Mahnung) pro Projekt. Nur Versand, keine eingehenden Antworten.';

--
-- Name: COLUMN email_log.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_log.customer_id IS 'Kunde, zu dem die Mail gehört (Anzeige im Kunden-Reiter E-Mails).';

--
-- Name: COLUMN email_log.sent_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_log.sent_by IS 'Nutzer, der die Mail ausgelöst hat.';

--
-- Name: COLUMN email_log.sent_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.email_log.sent_from IS 'Absender-Adresse bzw. Weg (z. B. Resend oder eigenes Postfach).';

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
    user_id uuid,
    kolonne_id uuid,
    fuehrerschein_klassen text[] DEFAULT '{}'::text[]
);

--
-- Name: COLUMN employees.fuehrerschein_klassen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.fuehrerschein_klassen IS 'Führerschein-Klassen des Mitarbeiters, z.B. {B,BE,C1}, fuer Fahrzeug-Berechtigungspruefung';

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
-- Name: impact_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impact_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event text NOT NULL,
    wert numeric,
    einheit text,
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    updated_by uuid,
    weight_kg numeric(10,2) DEFAULT 0
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
-- Name: invoice_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    size_bytes bigint NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bestaetigt_am timestamp with time zone,
    position_nr integer,
    fuer_auftraggeber boolean DEFAULT false NOT NULL,
    CONSTRAINT invoice_attachments_position_nr_check CHECK (((position_nr IS NULL) OR (position_nr >= 0)))
);

--
-- Name: invoice_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_counters (
    year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL,
    prefix text DEFAULT 'RE'::text NOT NULL
);

--
-- Name: invoice_freigabe_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_freigabe_override (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid,
    project_id uuid,
    admin_id uuid,
    grund text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: TABLE invoice_freigabe_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.invoice_freigabe_override IS 'Protokoll jeder Admin- oder Disponent-Überschreibung der Pflicht-Verknüpfung Prüfung/Freigabe → Rechnung (Phase 27). Jede Überschreibung braucht eine Begründung. Spalte admin_id enthält die user id der überschreibenden Person (admin oder disponent).';

--
-- Name: invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    invoice_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    CONSTRAINT invoice_payments_amount_check CHECK ((amount > (0)::numeric))
);

--
-- Name: TABLE invoice_payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.invoice_payments IS 'Zahlungshistorie je Rechnung – ermöglicht mehrere Teilzahlungen nachvollziehbar zu erfassen.';

--
-- Name: invoice_pruef_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_pruef_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    revoked_at timestamp with time zone
);

--
-- Name: invoice_pruefungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_pruefungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    link_id uuid,
    entscheidung text NOT NULL,
    geprueft_von text NOT NULL,
    kommentar text,
    geprueft_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_pruefungen_entscheidung_check CHECK ((entscheidung = ANY (ARRAY['akzeptiert'::text, 'aenderung'::text, 'abgelehnt'::text])))
);

--
-- Name: ki_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ki_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    project_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb,
    error text,
    model text,
    versuche integer DEFAULT 0 NOT NULL,
    max_versuche integer DEFAULT 3 NOT NULL,
    erstellt_von uuid,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    gestartet_am timestamp with time zone,
    fertig_am timestamp with time zone,
    CONSTRAINT ki_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'done'::text, 'error'::text])))
);

--
-- Name: kolonnen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kolonnen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    bauleiter_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE kolonnen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.kolonnen IS 'Feste Gerüstbau-Teams (Kolonnen) mit einem Bauleiter – Bauleiter sehen/verwalten nur ihre eigene Kolonne, Admin/Disposition alle.';

--
-- Name: lead_termine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_termine (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    datum date NOT NULL,
    uhrzeit text NOT NULL,
    art text NOT NULL,
    name text NOT NULL,
    firma text NOT NULL,
    email text NOT NULL,
    telefon text,
    nachricht text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT lead_termine_art_check CHECK ((art = ANY (ARRAY['telefon'::text, 'videocall'::text])))
);

--
-- Name: leistungskatalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leistungskatalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    kategorie text DEFAULT ''::text NOT NULL,
    bezeichnung text NOT NULL,
    beschreibung text,
    einheit text DEFAULT 'Stk.'::text NOT NULL,
    preis numeric(12,2),
    sortierung integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);

--
-- Name: nwd_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nwd_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    dateiname text NOT NULL,
    bytes bigint NOT NULL,
    status text DEFAULT 'upload'::text NOT NULL,
    stufe text,
    aps_objekt text,
    aps_urn text,
    fortschritt text,
    ergebnis_pfad text,
    ergebnis_format text,
    fehler_code text,
    fehler_text text,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    gestartet_am timestamp with time zone,
    fertig_am timestamp with time zone,
    aufgeraeumt boolean DEFAULT false NOT NULL,
    CONSTRAINT nwd_jobs_status_check CHECK ((status = ANY (ARRAY['upload'::text, 'konvertierung'::text, 'speichern'::text, 'fertig'::text, 'fehler'::text])))
);

--
-- Name: payroll_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    month text NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT payroll_documents_month_check CHECK ((month ~ '^\d{4}-\d{2}$'::text))
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
-- Name: project_access_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_access_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: TABLE project_access_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_access_tokens IS 'Ein nicht erratbarer Zufalls-Token pro Projekt für die Fern-Annahme des Angebots ohne Login (siehe /angebot/[token]).';

--
-- Name: project_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    rolle text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);

--
-- Name: TABLE project_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_assignments IS 'Formale Zuordnung: welcher Mitarbeiter ist welchem Auftrag zugewiesen (bisher nur indirekt über Zeiterfassung/Touren ableitbar).';

--
-- Name: project_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    tour_stop_id uuid,
    type text NOT NULL,
    text_note text,
    photos jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'offen'::text NOT NULL,
    employee_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pruefung_details jsonb,
    CONSTRAINT project_events_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'erledigt'::text]))),
    CONSTRAINT project_events_type_check CHECK ((type = ANY (ARRAY['pruefung_freigabe'::text, 'standzeit'::text, 'geruest_aenderung'::text, 'demontage'::text, 'ruecktransport'::text, 'ereignis'::text, 'sonstiges'::text])))
);

--
-- Name: TABLE project_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_events IS 'Dokumentations-Log für den Gerüstbau-Prozess nach dem Aufmaß: Prüfung/Freigabe, Standzeit-Änderungen, Gerüständerungen, Demontage, Rücktransport. Zugänglich für alle 5 Rollen.';

--
-- Name: COLUMN project_events.pruefung_details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.project_events.pruefung_details IS 'Nur bei type = pruefung_freigabe: strukturierte Angaben für das Prüfprotokoll-PDF (Gerüstklasse, Mängel, Kennzeichnung, Freigabe). Form: {geruestklasse, maengel_festgestellt, maengel_text, maengel_behoben, kennzeichnung_angebracht, freigegeben, freigegeben_durch, nutzungsende_geplant}.';

--
-- Name: project_mappe_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_mappe_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone
);

--
-- Name: TABLE project_mappe_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_mappe_links IS 'Öffentliche Links/QR-Codes auf die Baustellenmappe (siehe /baustelle/[token]). Nur Dokumente mit metadata.mappe = true, widerrufbar.';

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
-- Name: project_stand_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_stand_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone
);

--
-- Name: project_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    version_number integer NOT NULL,
    name text,
    adresse text,
    data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    note text
);

--
-- Name: TABLE project_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_versions IS 'Historie früherer Stände eines Projekts (Aufmaß-Versionierung). Wird bei jeder Aktualisierung eines bestehenden Projekts automatisch vor dem Überschreiben angelegt.';

--
-- Name: project_view_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_view_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    revoked_at timestamp with time zone
);

--
-- Name: TABLE project_view_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.project_view_links IS 'Nur-Lese-Links auf die 3D-Ansicht eines CAD-Projekts (siehe /ansicht/[token]). Ohne Preise, mit Ablaufdatum, widerrufbar.';

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
    status text DEFAULT 'active'::text,
    customer_id uuid
);

--
-- Name: COLUMN projects.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.customer_id IS 'Echte Verknüpfung zum Kundenstamm. NULL = altes Projekt vor dieser Umstellung, oder Auftrag ohne Kundenstamm-Eintrag (fällt auf Namensvergleich zurück).';

--
-- Name: projekt_lv; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projekt_lv (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    version integer NOT NULL,
    art text NOT NULL,
    titel text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'entwurf'::text NOT NULL,
    lv jsonb NOT NULL,
    summe_netto numeric(14,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT projekt_lv_art_check CHECK ((art = ANY (ARRAY['auftrag'::text, 'bestellwerterhoehung'::text, 'teilabbau'::text, 'nachtrag'::text]))),
    CONSTRAINT projekt_lv_status_check CHECK ((status = ANY (ARRAY['entwurf'::text, 'gueltig'::text, 'abgerechnet'::text])))
);

--
-- Name: schema_migrationen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrationen (
    name text NOT NULL,
    angewendet_am timestamp with time zone DEFAULT now() NOT NULL,
    bemerkung text
);

--
-- Name: TABLE schema_migrationen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.schema_migrationen IS 'Protokoll, welche SQL-Dateien aus supabase/ in dieser Instanz eingespielt wurden (Name ohne .sql).';

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
-- Name: subcontractor_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcontractor_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    subcontractor_id uuid NOT NULL,
    project_id uuid,
    project_name text,
    datum date NOT NULL,
    art text NOT NULL,
    menge numeric(10,2) NOT NULL,
    einheitspreis numeric(10,2) NOT NULL,
    betrag numeric(10,2) NOT NULL,
    stundenzettel boolean DEFAULT false,
    bemerkung text,
    status text DEFAULT 'offen'::text,
    created_by uuid
);

--
-- Name: subcontractors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcontractors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    firma text NOT NULL,
    ansprechpartner text,
    email text,
    phone text,
    street text,
    zip text,
    city text,
    ust_idnr text,
    steuernummer text,
    preis_m2_montage numeric(10,2) DEFAULT 0,
    preis_m2_demontage numeric(10,2) DEFAULT 0,
    stundensatz_regie numeric(10,2) DEFAULT 0,
    anfahrt_pauschale numeric(10,2) DEFAULT 0,
    sicherheitseinbehalt_prozent numeric(5,2) DEFAULT 0,
    gutschrift_verfahren boolean DEFAULT false,
    freistellung_bis date,
    unbedenklichkeit_bis date,
    haftpflicht_bis date,
    notizen text,
    is_active boolean DEFAULT true
);

--
-- Name: taeglicher_einsatz; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taeglicher_einsatz (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    einsatz_datum date NOT NULL,
    project_id uuid,
    notiz text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE taeglicher_einsatz; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.taeglicher_einsatz IS 'Wochenplanung: welcher Mitarbeiter ist an welchem Tag welchem Projekt zugeordnet (Drag & Drop). Urlaub/Krankheit kommen weiterhin aus der bestehenden absences-Tabelle, nicht dupliziert.';

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
    break_minutes integer DEFAULT 0 NOT NULL,
    spesen_euro numeric(8,2) DEFAULT 0,
    fahrzeit_minuten integer DEFAULT 0,
    uebernachtung boolean DEFAULT false
);

--
-- Name: COLUMN time_entries.break_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.time_entries.break_minutes IS 'Abgezogene Pause in Minuten (automatisch: 30 ab 6h, 45 ab 9h; oder manuell korrigiert)';

--
-- Name: COLUMN time_entries.spesen_euro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.time_entries.spesen_euro IS 'Verpflegungsmehraufwand/Spesen in Euro, manuell erfasst (keine automatische Steuersatz-Berechnung – bewusst, da sich die gesetzlichen Pauschalen ändern können).';

--
-- Name: COLUMN time_entries.fahrzeit_minuten; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.time_entries.fahrzeit_minuten IS 'Reine Fahrzeit in Minuten, getrennt von der eigentlichen Arbeitszeit erfasst.';

--
-- Name: COLUMN time_entries.uebernachtung; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.time_entries.uebernachtung IS 'Ob an diesem Tag eine Übernachtung (auswärtige Baustelle) angefallen ist.';

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
    completed_at timestamp with time zone,
    team_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    departed_at timestamp with time zone,
    departed_lat double precision,
    departed_lng double precision,
    returned_at timestamp with time zone,
    returned_lat double precision,
    returned_lng double precision
);

--
-- Name: COLUMN tours.team_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tours.team_ids IS 'Team der Tour (Mehrfachauswahl); erste ID = Fahrer (driver_id).';

--
-- Name: COLUMN tours.departed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tours.departed_at IS 'Zeitpunkt "Vom Hof gefahren" (Knopf in Meine Touren).';

--
-- Name: COLUMN tours.returned_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tours.returned_at IS 'Zeitpunkt "Zurück auf dem Hof" (Knopf in Meine Touren).';

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
    is_active boolean DEFAULT true,
    typ text,
    zulaessiges_gesamtgewicht_kg numeric(10,2),
    nutzlast_kg numeric(10,2)
);

--
-- Name: COLUMN vehicles.zulaessiges_gesamtgewicht_kg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicles.zulaessiges_gesamtgewicht_kg IS 'Zulässiges Gesamtgewicht in kg - bestimmt die erforderliche Führerschein-Klasse';

--
-- Name: COLUMN vehicles.nutzlast_kg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicles.nutzlast_kg IS 'Nutzlast in kg - für automatische Fahrzeug-Vorauswahl anhand Materialgewicht';

--
-- Name: abrechnung_m2 abrechnung_m2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abrechnung_m2
    ADD CONSTRAINT abrechnung_m2_pkey PRIMARY KEY (id);

--
-- Name: absences absences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absences
    ADD CONSTRAINT absences_pkey PRIMARY KEY (id);

--
-- Name: besuche besuche_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.besuche
    ADD CONSTRAINT besuche_pkey PRIMARY KEY (id);

--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);

--
-- Name: customer_contacts customer_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_pkey PRIMARY KEY (id);

--
-- Name: customer_emails customer_emails_customer_id_email_account_id_imap_mailbox_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_emails
    ADD CONSTRAINT customer_emails_customer_id_email_account_id_imap_mailbox_i_key UNIQUE (customer_id, email_account_id, imap_mailbox, imap_uid);

--
-- Name: customer_emails customer_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_emails
    ADD CONSTRAINT customer_emails_pkey PRIMARY KEY (id);

--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

--
-- Name: delivery_note_counters delivery_note_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_note_counters
    ADD CONSTRAINT delivery_note_counters_pkey PRIMARY KEY (year);

--
-- Name: delivery_notes delivery_notes_ls_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_ls_number_key UNIQUE (ls_number);

--
-- Name: delivery_notes delivery_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_pkey PRIMARY KEY (id);

--
-- Name: demo_ip_sperre demo_ip_sperre_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_ip_sperre
    ADD CONSTRAINT demo_ip_sperre_pkey PRIMARY KEY (ip);

--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);

--
-- Name: email_accounts email_accounts_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_accounts
    ADD CONSTRAINT email_accounts_employee_id_key UNIQUE (employee_id);

--
-- Name: email_accounts email_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_accounts
    ADD CONSTRAINT email_accounts_pkey PRIMARY KEY (id);

--
-- Name: email_log email_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_pkey PRIMARY KEY (id);

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
-- Name: impact_events impact_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_events
    ADD CONSTRAINT impact_events_pkey PRIMARY KEY (id);

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
-- Name: invoice_attachments invoice_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_attachments
    ADD CONSTRAINT invoice_attachments_pkey PRIMARY KEY (id);

--
-- Name: invoice_counters invoice_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_counters
    ADD CONSTRAINT invoice_counters_pkey PRIMARY KEY (year, prefix);

--
-- Name: invoice_freigabe_override invoice_freigabe_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_freigabe_override
    ADD CONSTRAINT invoice_freigabe_override_pkey PRIMARY KEY (id);

--
-- Name: invoice_payments invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);

--
-- Name: invoice_pruef_links invoice_pruef_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_pruef_links
    ADD CONSTRAINT invoice_pruef_links_pkey PRIMARY KEY (id);

--
-- Name: invoice_pruef_links invoice_pruef_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_pruef_links
    ADD CONSTRAINT invoice_pruef_links_token_key UNIQUE (token);

--
-- Name: invoice_pruefungen invoice_pruefungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_pruefungen
    ADD CONSTRAINT invoice_pruefungen_pkey PRIMARY KEY (id);

--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);

--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

--
-- Name: ki_jobs ki_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ki_jobs
    ADD CONSTRAINT ki_jobs_pkey PRIMARY KEY (id);

--
-- Name: kolonnen kolonnen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kolonnen
    ADD CONSTRAINT kolonnen_pkey PRIMARY KEY (id);

--
-- Name: lead_termine lead_termine_datum_uhrzeit_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_termine
    ADD CONSTRAINT lead_termine_datum_uhrzeit_key UNIQUE (datum, uhrzeit);

--
-- Name: lead_termine lead_termine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_termine
    ADD CONSTRAINT lead_termine_pkey PRIMARY KEY (id);

--
-- Name: leistungskatalog leistungskatalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leistungskatalog
    ADD CONSTRAINT leistungskatalog_pkey PRIMARY KEY (id);

--
-- Name: nwd_jobs nwd_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nwd_jobs
    ADD CONSTRAINT nwd_jobs_pkey PRIMARY KEY (id);

--
-- Name: payroll_documents payroll_documents_employee_id_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_documents
    ADD CONSTRAINT payroll_documents_employee_id_month_key UNIQUE (employee_id, month);

--
-- Name: payroll_documents payroll_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_documents
    ADD CONSTRAINT payroll_documents_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: project_access_tokens project_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_access_tokens
    ADD CONSTRAINT project_access_tokens_pkey PRIMARY KEY (id);

--
-- Name: project_access_tokens project_access_tokens_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_access_tokens
    ADD CONSTRAINT project_access_tokens_project_id_key UNIQUE (project_id);

--
-- Name: project_access_tokens project_access_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_access_tokens
    ADD CONSTRAINT project_access_tokens_token_key UNIQUE (token);

--
-- Name: project_assignments project_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_pkey PRIMARY KEY (id);

--
-- Name: project_assignments project_assignments_project_id_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_project_id_employee_id_key UNIQUE (project_id, employee_id);

--
-- Name: project_events project_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_events
    ADD CONSTRAINT project_events_pkey PRIMARY KEY (id);

--
-- Name: project_mappe_links project_mappe_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_mappe_links
    ADD CONSTRAINT project_mappe_links_pkey PRIMARY KEY (id);

--
-- Name: project_mappe_links project_mappe_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_mappe_links
    ADD CONSTRAINT project_mappe_links_token_key UNIQUE (token);

--
-- Name: project_media project_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_media
    ADD CONSTRAINT project_media_pkey PRIMARY KEY (id);

--
-- Name: project_stand_links project_stand_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_stand_links
    ADD CONSTRAINT project_stand_links_pkey PRIMARY KEY (id);

--
-- Name: project_stand_links project_stand_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_stand_links
    ADD CONSTRAINT project_stand_links_token_key UNIQUE (token);

--
-- Name: project_versions project_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_versions
    ADD CONSTRAINT project_versions_pkey PRIMARY KEY (id);

--
-- Name: project_view_links project_view_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_view_links
    ADD CONSTRAINT project_view_links_pkey PRIMARY KEY (id);

--
-- Name: project_view_links project_view_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_view_links
    ADD CONSTRAINT project_view_links_token_key UNIQUE (token);

--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

--
-- Name: projekt_lv projekt_lv_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekt_lv
    ADD CONSTRAINT projekt_lv_pkey PRIMARY KEY (id);

--
-- Name: projekt_lv projekt_lv_project_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekt_lv
    ADD CONSTRAINT projekt_lv_project_id_version_key UNIQUE (project_id, version);

--
-- Name: schema_migrationen schema_migrationen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrationen
    ADD CONSTRAINT schema_migrationen_pkey PRIMARY KEY (name);

--
-- Name: site_stock site_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_stock
    ADD CONSTRAINT site_stock_pkey PRIMARY KEY (id);

--
-- Name: subcontractor_entries subcontractor_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_entries
    ADD CONSTRAINT subcontractor_entries_pkey PRIMARY KEY (id);

--
-- Name: subcontractors subcontractors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractors
    ADD CONSTRAINT subcontractors_pkey PRIMARY KEY (id);

--
-- Name: taeglicher_einsatz taeglicher_einsatz_employee_id_einsatz_datum_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taeglicher_einsatz
    ADD CONSTRAINT taeglicher_einsatz_employee_id_einsatz_datum_key UNIQUE (employee_id, einsatz_datum);

--
-- Name: taeglicher_einsatz taeglicher_einsatz_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taeglicher_einsatz
    ADD CONSTRAINT taeglicher_einsatz_pkey PRIMARY KEY (id);

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
-- Name: abrechnung_m2_art_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abrechnung_m2_art_idx ON public.abrechnung_m2 USING btree (art, name);

--
-- Name: employees_kolonne_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_kolonne_idx ON public.employees USING btree (kolonne_id) WHERE (kolonne_id IS NOT NULL);

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
-- Name: idx_besuche_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_besuche_tag ON public.besuche USING btree (tag);

--
-- Name: idx_customer_contacts_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_contacts_customer ON public.customer_contacts USING btree (customer_id);

--
-- Name: idx_customer_emails_kunde; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_emails_kunde ON public.customer_emails USING btree (customer_id, datum DESC);

--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);

--
-- Name: idx_delivery_notes_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_notes_customer ON public.delivery_notes USING btree (customer_id);

--
-- Name: idx_delivery_notes_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_notes_project ON public.delivery_notes USING btree (project_id);

--
-- Name: idx_drivers_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_employee_id ON public.drivers USING btree (employee_id);

--
-- Name: idx_email_log_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_customer ON public.email_log USING btree (customer_id, sent_at DESC);

--
-- Name: idx_email_log_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_project_id ON public.email_log USING btree (project_id);

--
-- Name: idx_email_log_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_sent_at ON public.email_log USING btree (sent_at);

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
-- Name: idx_impact_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_impact_events_created ON public.impact_events USING btree (created_at);

--
-- Name: idx_impact_events_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_impact_events_event ON public.impact_events USING btree (event);

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
-- Name: idx_invoice_attachments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_attachments_invoice ON public.invoice_attachments USING btree (invoice_id, created_at);

--
-- Name: idx_invoice_freigabe_override_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_freigabe_override_project ON public.invoice_freigabe_override USING btree (project_id);

--
-- Name: idx_invoice_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments USING btree (invoice_id);

--
-- Name: idx_invoice_pruef_links_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_pruef_links_invoice ON public.invoice_pruef_links USING btree (invoice_id);

--
-- Name: idx_invoice_pruefungen_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_pruefungen_invoice ON public.invoice_pruefungen USING btree (invoice_id, geprueft_am DESC);

--
-- Name: idx_invoices_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer_id ON public.invoices USING btree (customer_id);

--
-- Name: idx_ki_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ki_jobs_status ON public.ki_jobs USING btree (status, erstellt_am);

--
-- Name: idx_lead_termine_datum; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_termine_datum ON public.lead_termine USING btree (datum);

--
-- Name: idx_nwd_jobs_urn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nwd_jobs_urn ON public.nwd_jobs USING btree (aps_urn);

--
-- Name: idx_nwd_jobs_user_zeit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nwd_jobs_user_zeit ON public.nwd_jobs USING btree (user_id, erstellt_am DESC);

--
-- Name: idx_nwd_jobs_zeit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nwd_jobs_zeit ON public.nwd_jobs USING btree (erstellt_am DESC);

--
-- Name: idx_payroll_documents_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_documents_employee ON public.payroll_documents USING btree (employee_id);

--
-- Name: idx_project_access_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_access_tokens_token ON public.project_access_tokens USING btree (token);

--
-- Name: idx_project_assignments_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_assignments_employee ON public.project_assignments USING btree (employee_id);

--
-- Name: idx_project_assignments_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_assignments_project ON public.project_assignments USING btree (project_id);

--
-- Name: idx_project_events_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_events_project_id ON public.project_events USING btree (project_id);

--
-- Name: idx_project_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_events_status ON public.project_events USING btree (status);

--
-- Name: idx_project_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_events_type ON public.project_events USING btree (type);

--
-- Name: idx_project_mappe_links_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_mappe_links_project ON public.project_mappe_links USING btree (project_id);

--
-- Name: idx_project_media_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_media_session ON public.project_media USING btree (session_id) WHERE (project_id IS NULL);

--
-- Name: idx_project_media_source_format; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_media_source_format ON public.project_media USING btree (((metadata ->> 'source_format'::text))) WHERE (metadata ? 'source_format'::text);

--
-- Name: idx_project_stand_links_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_stand_links_project ON public.project_stand_links USING btree (project_id);

--
-- Name: idx_project_versions_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_versions_project_id ON public.project_versions USING btree (project_id, version_number DESC);

--
-- Name: idx_project_view_links_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_view_links_project ON public.project_view_links USING btree (project_id);

--
-- Name: idx_projects_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_customer_id ON public.projects USING btree (customer_id);

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
-- Name: invoices_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_date_idx ON public.invoices USING btree (invoice_date);

--
-- Name: invoices_geruest_nr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_geruest_nr_idx ON public.invoices USING btree (geruest_nr);

--
-- Name: invoices_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_project_idx ON public.invoices USING btree (project_id);

--
-- Name: invoices_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);

--
-- Name: kolonnen_bauleiter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kolonnen_bauleiter_idx ON public.kolonnen USING btree (bauleiter_id) WHERE (bauleiter_id IS NOT NULL);

--
-- Name: leistungskatalog_sortierung_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leistungskatalog_sortierung_idx ON public.leistungskatalog USING btree (is_active, kategorie, sortierung, bezeichnung);

--
-- Name: projekt_lv_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projekt_lv_project_idx ON public.projekt_lv USING btree (project_id, version DESC);

--
-- Name: sub_entries_datum_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sub_entries_datum_idx ON public.subcontractor_entries USING btree (datum);

--
-- Name: sub_entries_sub_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sub_entries_sub_idx ON public.subcontractor_entries USING btree (subcontractor_id);

--
-- Name: taeglicher_einsatz_datum_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taeglicher_einsatz_datum_idx ON public.taeglicher_einsatz USING btree (einsatz_datum);

--
-- Name: taeglicher_einsatz_projekt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taeglicher_einsatz_projekt_idx ON public.taeglicher_einsatz USING btree (project_id) WHERE (project_id IS NOT NULL);

--
-- Name: time_entries_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entries_project_idx ON public.time_entries USING btree (project_id) WHERE (project_id IS NOT NULL);

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
-- Name: customer_contacts customer_contacts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

--
-- Name: customer_emails customer_emails_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_emails
    ADD CONSTRAINT customer_emails_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

--
-- Name: customer_emails customer_emails_email_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_emails
    ADD CONSTRAINT customer_emails_email_account_id_fkey FOREIGN KEY (email_account_id) REFERENCES public.email_accounts(id) ON DELETE CASCADE;

--
-- Name: delivery_notes delivery_notes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

--
-- Name: delivery_notes delivery_notes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

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
-- Name: email_accounts email_accounts_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_accounts
    ADD CONSTRAINT email_accounts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: email_log email_log_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

--
-- Name: email_log email_log_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

--
-- Name: email_log email_log_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

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
-- Name: employees employees_kolonne_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_kolonne_id_fkey FOREIGN KEY (kolonne_id) REFERENCES public.kolonnen(id) ON DELETE SET NULL;

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
-- Name: invoice_attachments invoice_attachments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_attachments
    ADD CONSTRAINT invoice_attachments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

--
-- Name: invoice_freigabe_override invoice_freigabe_override_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_freigabe_override
    ADD CONSTRAINT invoice_freigabe_override_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

--
-- Name: invoice_freigabe_override invoice_freigabe_override_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_freigabe_override
    ADD CONSTRAINT invoice_freigabe_override_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

--
-- Name: invoice_payments invoice_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

--
-- Name: invoice_pruef_links invoice_pruef_links_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_pruef_links
    ADD CONSTRAINT invoice_pruef_links_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

--
-- Name: invoice_pruefungen invoice_pruefungen_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_pruefungen
    ADD CONSTRAINT invoice_pruefungen_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

--
-- Name: invoice_pruefungen invoice_pruefungen_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_pruefungen
    ADD CONSTRAINT invoice_pruefungen_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.invoice_pruef_links(id) ON DELETE SET NULL;

--
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

--
-- Name: invoices invoices_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: kolonnen kolonnen_bauleiter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kolonnen
    ADD CONSTRAINT kolonnen_bauleiter_id_fkey FOREIGN KEY (bauleiter_id) REFERENCES public.employees(id) ON DELETE SET NULL;

--
-- Name: payroll_documents payroll_documents_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_documents
    ADD CONSTRAINT payroll_documents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

--
-- Name: payroll_documents payroll_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_documents
    ADD CONSTRAINT payroll_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: project_access_tokens project_access_tokens_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_access_tokens
    ADD CONSTRAINT project_access_tokens_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

--
-- Name: project_assignments project_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

--
-- Name: project_assignments project_assignments_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

--
-- Name: project_events project_events_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_events
    ADD CONSTRAINT project_events_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);

--
-- Name: project_events project_events_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_events
    ADD CONSTRAINT project_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

--
-- Name: project_events project_events_tour_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_events
    ADD CONSTRAINT project_events_tour_stop_id_fkey FOREIGN KEY (tour_stop_id) REFERENCES public.tour_stops(id) ON DELETE SET NULL;

--
-- Name: project_mappe_links project_mappe_links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_mappe_links
    ADD CONSTRAINT project_mappe_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

--
-- Name: project_media project_media_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_media
    ADD CONSTRAINT project_media_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);

--
-- Name: project_stand_links project_stand_links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_stand_links
    ADD CONSTRAINT project_stand_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

--
-- Name: project_versions project_versions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_versions
    ADD CONSTRAINT project_versions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

--
-- Name: project_view_links project_view_links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_view_links
    ADD CONSTRAINT project_view_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

--
-- Name: projects projects_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

--
-- Name: projekt_lv projekt_lv_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekt_lv
    ADD CONSTRAINT projekt_lv_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

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
-- Name: subcontractor_entries subcontractor_entries_subcontractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_entries
    ADD CONSTRAINT subcontractor_entries_subcontractor_id_fkey FOREIGN KEY (subcontractor_id) REFERENCES public.subcontractors(id) ON DELETE CASCADE;

--
-- Name: taeglicher_einsatz taeglicher_einsatz_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taeglicher_einsatz
    ADD CONSTRAINT taeglicher_einsatz_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

--
-- Name: taeglicher_einsatz taeglicher_einsatz_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taeglicher_einsatz
    ADD CONSTRAINT taeglicher_einsatz_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

--
-- Name: time_entries time_entries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);

--
-- Name: time_entries time_entries_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

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
-- Name: abrechnung_m2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abrechnung_m2 ENABLE ROW LEVEL SECURITY;

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
-- Name: besuche; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.besuche ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings company_settings_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_authenticated_all ON public.company_settings TO authenticated USING (true) WITH CHECK (true);

--
-- Name: customer_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_authenticated_all ON public.customers TO authenticated USING (true) WITH CHECK (true);

--
-- Name: delivery_note_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_note_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_ip_sperre; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.demo_ip_sperre ENABLE ROW LEVEL SECURITY;

--
-- Name: drivers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

--
-- Name: drivers drivers_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drivers_authenticated_all ON public.drivers TO authenticated USING (true) WITH CHECK (true);

--
-- Name: email_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

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
-- Name: impact_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.impact_events ENABLE ROW LEVEL SECURITY;

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
-- Name: invoice_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_freigabe_override; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_freigabe_override ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_pruef_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_pruef_links ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_pruefungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_pruefungen ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_authenticated_all ON public.invoices TO authenticated USING (true) WITH CHECK (true);

--
-- Name: ki_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ki_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: kolonnen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kolonnen ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_termine; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_termine ENABLE ROW LEVEL SECURITY;

--
-- Name: leistungskatalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leistungskatalog ENABLE ROW LEVEL SECURITY;

--
-- Name: nwd_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nwd_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_documents ENABLE ROW LEVEL SECURITY;

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
-- Name: project_access_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_access_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: project_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: project_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;

--
-- Name: project_mappe_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_mappe_links ENABLE ROW LEVEL SECURITY;

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
-- Name: project_stand_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_stand_links ENABLE ROW LEVEL SECURITY;

--
-- Name: project_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: project_view_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_view_links ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projekt_lv; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projekt_lv ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrationen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schema_migrationen ENABLE ROW LEVEL SECURITY;

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
-- Name: subcontractor_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcontractor_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: subcontractors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;

--
-- Name: taeglicher_einsatz; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.taeglicher_einsatz ENABLE ROW LEVEL SECURITY;

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
-- PostgreSQL database dump complete
--

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

insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', true)
on conflict (id) do update set public = true;

-- ============================================================
-- ANHANG: phase-statiker.sql
-- (idempotent; läuft nach allen Tabellen, damit Schleifen über alle Tabellen auch die neuen erfassen)
-- ============================================================
-- ============================================================
-- SCAFFOLD OS – Statiker-Rolle (externe Ingenieurbüros)
--
-- Im Supabase SQL Editor ausführen (einmal). Kann gefahrlos wiederholt
-- werden. Es wird nichts gelöscht, außer dass die Rollen-Prüfung der
-- Tabelle "profiles" durch eine Version ersetzt wird, die zusätzlich
-- die Rolle "statiker" erlaubt.
--
-- Was das SQL macht:
--  1) Rolle "statiker" in der Rollen-Prüfung von profiles erlauben
--  2) Tabelle project_statiker: welcher Statiker darf welches Projekt sehen
--  3) Hilfsfunktion is_statiker() (liest das Flag aus dem Login-Token)
--  4) Für ALLE Tabellen mit aktivem Zeilenschutz (RLS): eine zusätzliche
--     "restriktive" Regel, die Statiker-Logins den direkten Datenbank-
--     Zugriff aus dem Browser verbietet. Normale Logins bleiben unberührt.
--     Auf "profiles" darf ein Statiker nur die eigene Zeile lesen.
--
-- Wichtig: Die App sperrt Statiker zusätzlich selbst (proxy.ts). Die
-- Regeln hier sind die zweite Sicherung, falls jemand die Datenbank
-- direkt mit dem öffentlichen Schlüssel anspricht.
-- ============================================================

-- 1) Rolle "statiker" erlauben -----------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'disponent'::text, 'bauleiter'::text, 'mitarbeiter'::text, 'lager'::text, 'statiker'::text]));

-- 2) Freigaben: Statiker <-> Projekt ------------------------------------
CREATE TABLE IF NOT EXISTS public.project_statiker (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_statiker_user ON public.project_statiker (user_id);
ALTER TABLE public.project_statiker ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Regel für normale Logins: nur der Server (Service-Schlüssel) liest/schreibt hier.
COMMENT ON TABLE public.project_statiker IS 'Freigabe: welcher Statiker-Login darf welches CAD-Projekt (nur lesend, ohne Preise) sehen.';

-- 3) Hilfsfunktion ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_statiker()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'statiker')::boolean, false)
$$;

-- 4) Direkten Datenbank-Zugriff für Statiker sperren -------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tabelle
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND c.relname NOT IN ('profiles', 'project_statiker')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS no_statiker ON public.%I', t.tabelle);
    EXECUTE format(
      'CREATE POLICY no_statiker ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_statiker()) WITH CHECK (NOT public.is_statiker())',
      t.tabelle
    );
  END LOOP;
END $$;

-- profiles: Statiker darf nur die eigene Zeile lesen (die App braucht das beim Login)
DROP POLICY IF EXISTS no_statiker ON public.profiles;
CREATE POLICY no_statiker ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_statiker() OR id = auth.uid())
  WITH CHECK (NOT public.is_statiker());

-- Dateispeicher (Fotos, Dokumente): gleiche Sperre. Falls die Datenbank das
-- Ändern dieser Tabelle nicht erlaubt, läuft der Rest trotzdem durch.
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS no_statiker ON storage.objects';
  EXECUTE 'CREATE POLICY no_statiker ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_statiker()) WITH CHECK (NOT public.is_statiker())';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'storage.objects konnte nicht angepasst werden: %', SQLERRM;
END $$;

-- Hinweis: Tabellen, die NACH diesem Lauf neu angelegt werden, bekommen die
-- Sperre nicht automatisch. Dann dieses SQL einfach noch einmal ausführen.

-- Basis-Eintrag im Protokoll: Stand, mit dem diese Instanz angelegt wurde (Basis-Eintrag, damit spätere phase-N-Dateien eindeutig nachvollziehbar sind)
insert into public.schema_migrationen (name, bemerkung)
values ('kunden-schema-2026-11-08', 'Instanz aus supabase/kunden-schema.sql angelegt')
on conflict (name) do nothing;
