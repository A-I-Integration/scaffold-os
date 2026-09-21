-- Phase 94: "Neue Version anlegen" (Storno + Ersatz-Rechnung) atomar machen
--
-- Hintergrund (Bug-Report, "Punkt 4" aus dem DATEV/Rechnung-Audit):
-- app/kunden/[id]/page.tsx (saveAlsNeueVersion) hat den Korrektur-Fluss
-- ("Neue Version" ersetzt eine bestehende Rechnung, GoBD-Storno statt
-- nachträglicher Änderung) bisher als ZWEI getrennte, unverzahnte Requests
-- gemacht:
--   1. POST /api/invoices  → neue Rechnung anlegen
--   2. PATCH /api/invoices → alte Rechnung auf status='storniert' setzen
-- Schritt 2 wurde nie auf Erfolg geprüft (kein "if (!json.success) throw").
-- Schlägt Schritt 2 fehl (Netzwerkfehler, DB-Fehler), bleibt die alte
-- Rechnung "offen", während zugleich schon eine neue, inhaltsgleiche
-- Rechnung existiert – doppelte Buchung, GoBD-Inkonsistenz, und die
-- Oberfläche meldet trotzdem "Erfolg".
--
-- Fix: EINE Postgres-Funktion, die die neue Rechnung anlegt UND die alte
-- als storniert markiert, in derselben Transaktion (RPC über PostgREST
-- läuft immer atomar – gleiches Muster wie phase-93-rechnung-atomar.sql).
-- Schlägt einer der beiden Schritte fehl, wird alles zurückgerollt: es
-- entsteht nie eine neue Rechnung ohne stornierte alte, und nie eine
-- stornierte alte ohne neue Rechnung.
--
-- Zusätzliche Absicherung (in dieser Funktion, nicht im Client):
--   - alte Rechnung muss existieren, sonst Exception
--   - alte Rechnung darf nicht bereits 'storniert' sein, sonst Exception
--     (verhindert, dass aus Versehen zweimal "Neue Version" auf dieselbe
--     bereits ersetzte Rechnung ausgeführt wird)
--   - die Notiz auf der alten Rechnung ("Ersetzt durch RE-2026-00XX am
--     TT.MM.JJJJ") wird serverseitig mit der ECHTEN, gerade vergebenen
--     neuen Rechnungsnummer gebaut, nicht clientseitig geraten.
--
-- REIN ADDITIV: create_invoice() bleibt unverändert bestehen und wird von
-- dieser neuen Funktion intern weiter genutzt, next_invoice_number() bleibt
-- ebenfalls unverändert. WICHTIG: Diese Migration muss VOR dem zugehörigen
-- App-Code-Deploy ausgeführt werden (gleiches Muster wie phase-93/phase-91),
-- sonst schlägt "Neue Version anlegen" kurzzeitig mit PGRST202 fehl.

CREATE OR REPLACE FUNCTION create_invoice_as_new_version(
  p_old_invoice_id uuid,
  p_prefix text,
  p_project_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_address text,
  p_positions jsonb,
  p_net_amount numeric,
  p_tax_rate numeric,
  p_tax_amount numeric,
  p_gross_amount numeric,
  p_invoice_date date,
  p_due_date date,
  p_notes text,
  p_company_snapshot jsonb,
  p_invoice_type text,
  p_reference_invoice_number text
)
RETURNS invoices
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_status text;
  v_old_notes text;
  v_new_row invoices;
BEGIN
  -- Alte Rechnung sperren (FOR UPDATE) und prüfen, solange die Transaktion
  -- läuft - verhindert eine Race-Condition, falls parallel ein zweiter
  -- "Neue Version"-Aufruf für dieselbe Rechnung läuft.
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

  -- Neue Rechnung über die bestehende, bereits atomare create_invoice()
  -- anlegen (Nummernvergabe + Insert bleiben deren Verantwortung).
  v_new_row := create_invoice(
    p_prefix, p_project_id, p_customer_id, p_customer_name, p_customer_address,
    p_positions, p_net_amount, p_tax_rate, p_tax_amount, p_gross_amount,
    p_invoice_date, p_due_date, p_notes, p_company_snapshot, p_invoice_type,
    p_reference_invoice_number
  );

  -- Alte Rechnung stornieren, Notiz mit der echten neuen Rechnungsnummer.
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
