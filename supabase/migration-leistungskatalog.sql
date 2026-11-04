-- ============================================================
-- SCAFFOLD OS – Migration: Leistungskatalog (Stammdaten)
--
-- Einmal pro Supabase-Projekt ausführen (SQL Editor):
-- Master-Instanz + jede Kunden-Instanz. Idempotent.
--
-- Firmeneigene Liste aller angebotenen Leistungen mit Einheit und Preis
-- (z. B. Fassadengerüst aufbauen €/m², Vorhaltung €/m²/Woche, Treppenturm €/Stück).
-- Zugriff NUR über die API-Route /api/leistungskatalog (SERVICE_ROLE_KEY):
-- RLS ist aktiv, es gibt bewusst keine Policies (gleiches Muster wie subcontractors).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leistungskatalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    kategorie text NOT NULL DEFAULT '',
    bezeichnung text NOT NULL,
    beschreibung text,
    einheit text NOT NULL DEFAULT 'Stk.',
    -- Einzelpreis netto; NULL = "nach Aufwand / auf Anfrage"
    preis numeric(12,2),
    sortierung integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS leistungskatalog_sortierung_idx ON public.leistungskatalog (is_active, kategorie, sortierung, bezeichnung);

ALTER TABLE public.leistungskatalog ENABLE ROW LEVEL SECURITY;
