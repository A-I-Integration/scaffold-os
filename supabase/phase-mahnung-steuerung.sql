-- ============================================================
-- Mahnwesen steuern: Pause je Rechnung, freundliche Zahlungserinnerung
-- Rein additiv. Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

-- Pause: automatische Erinnerung/Mahnung für diese Rechnung aussetzen (nur intern, nie auf Dokumenten)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS mahnung_pausiert boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS mahnung_pause_grund text;

-- Datum der gesendeten Zahlungserinnerung (Vorstufe vor der 1. Mahnung, ohne Gebühren)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS erinnerung_am date;

-- Automatische Zahlungserinnerung: nach so vielen Tagen Überfälligkeit. Leer oder 0 = aus.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS mahnung_erinnerung_tage integer;
