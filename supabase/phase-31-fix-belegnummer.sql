-- ============================================================
-- Phase 31: Fix "Could not choose the best candidate function"
--
-- Ursache: Phase 22 hat next_invoice_number() um einen Parameter
-- (p_prefix) erweitert, aber CREATE OR REPLACE ersetzt eine Funktion
-- nur bei GLEICHER Signatur – bei unterschiedlicher Signatur legt
-- Postgres eine zweite, parallele Funktion an. Dadurch gab es
-- next_invoice_number() UND next_invoice_number(p_prefix text)
-- gleichzeitig, und PostgREST konnte bei einem Aufruf ohne Parameter
-- nicht entscheiden, welche gemeint ist.
--
-- Fix: die alte, parameterlose Version explizit entfernen. Nur die
-- neue mit Standardwert p_prefix = 'RE' bleibt – Aufrufe ohne
-- Parameter funktionieren damit weiterhin genauso wie vorher.
--
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

DROP FUNCTION IF EXISTS next_invoice_number();

-- Zur Sicherheit erneut anlegen (falls in einer Instanz die neue
-- Version aus Phase 22 nie ankam und nur die alte existierte):
CREATE OR REPLACE FUNCTION next_invoice_number(p_prefix text DEFAULT 'RE')
RETURNS text
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
