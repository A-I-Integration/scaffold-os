-- ============================================================
-- SCAFFOLD OS – Phase 17: Impact-Tracking (Pilot-Kennzahlen)
--
-- Misst betriebliche Wirkung pro Mandant (Angebote, Rechnungen,
-- Projekt-Margen …), damit wir nach den Pilotkunden echte
-- Zahlen statt Schätzungen zeigen können.
--
-- Rein betriebliche Ereignisse – KEINE Personendaten (DSGVO-ok).
-- Idempotent: kann beliebig oft ausgeführt werden.
-- Im Supabase SQL-Editor der KUNDEN-Instanz ausführen
-- (für neue Kunden ist es bereits im kunden-schema.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS impact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,              -- z. B. 'rechnung', 'angebot', 'tour_km'
  wert numeric,                     -- Betrag, Stunden, Kilometer …
  einheit text,                     -- 'eur', 'std', 'km', '%'
  meta jsonb DEFAULT '{}'::jsonb,   -- optionale Zusatzinfos (projekt_id …)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impact_events_event ON impact_events (event);
CREATE INDEX IF NOT EXISTS idx_impact_events_created ON impact_events (created_at);

-- Row Level Security: niemand schreibt/liest direkt vom Browser –
-- Zugriff läuft ausschließlich über API-Routen mit Service-Key.
ALTER TABLE impact_events ENABLE ROW LEVEL SECURITY;
