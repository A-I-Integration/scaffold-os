-- ============================================================
-- SCAFFOLD OS – Migration: Nachunternehmer-Modul
--
-- Einmal pro Supabase-Projekt ausführen (SQL Editor):
-- Master-Instanz + jede Kunden-Instanz (Demo-Instanz nicht
-- vergessen, falls das Modul dort sichtbar sein soll).
-- Idempotent: Mehrfach ausführen schadet nicht.
--
-- Zwei Tabellen:
--   subcontractors        → Stammdaten, Rahmenvertrag-Preise,
--                           Nachweise (Nachunternehmerhaftung)
--   subcontractor_entries → Leistungserfassung (m² / Stunden /
--                           Anfahrt) mit Preis-Snapshot
--
-- Zugriff NUR über die API-Routen (SERVICE_ROLE_KEY):
-- RLS ist aktiv, es gibt bewusst keine Policies – für normale
-- Nutzer sind beide Tabellen komplett unsichtbar (gleiches
-- Muster wie demo_ip_sperre).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subcontractors (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    -- Stammdaten
    firma text NOT NULL,
    ansprechpartner text,
    email text,
    phone text,
    street text,
    zip text,
    city text,
    ust_idnr text,
    steuernummer text,
    -- Rahmenvertrag: Einheitspreise (netto)
    preis_m2_montage numeric(10,2) DEFAULT 0,
    preis_m2_demontage numeric(10,2) DEFAULT 0,
    stundensatz_regie numeric(10,2) DEFAULT 0,
    anfahrt_pauschale numeric(10,2) DEFAULT 0,
    -- Konditionen
    sicherheitseinbehalt_prozent numeric(5,2) DEFAULT 0,
    gutschrift_verfahren boolean DEFAULT false, -- §14 Abs. 2 UStG vereinbart
    -- Nachweise (Nachunternehmerhaftung: §48b EStG, §28e SGB IV, §1 AEntG)
    freistellung_bis date,       -- Freistellungsbescheinigung §48b EStG
    unbedenklichkeit_bis date,   -- Unbedenklichkeitsbescheinigung
    haftpflicht_bis date,        -- Betriebshaftpflichtversicherung
    notizen text,
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.subcontractor_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
    project_id uuid,
    project_name text,
    datum date NOT NULL,
    art text NOT NULL,                  -- montage_m2 | demontage_m2 | regie_stunden | anfahrt
    menge numeric(10,2) NOT NULL,       -- m² bzw. Stunden bzw. 1 (Pauschale)
    einheitspreis numeric(10,2) NOT NULL, -- Snapshot zum Erfassungszeitpunkt
    betrag numeric(10,2) NOT NULL,      -- menge × einheitspreis (serverseitig gerechnet)
    stundenzettel boolean DEFAULT false, -- bei Regie: Stundenlohnzettel unterschrieben (VOB/B §15)
    bemerkung text,
    status text DEFAULT 'offen',        -- offen | abgerechnet
    created_by uuid
);

CREATE INDEX IF NOT EXISTS sub_entries_sub_idx
    ON public.subcontractor_entries (subcontractor_id);
CREATE INDEX IF NOT EXISTS sub_entries_datum_idx
    ON public.subcontractor_entries (datum);

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_entries ENABLE ROW LEVEL SECURITY;
