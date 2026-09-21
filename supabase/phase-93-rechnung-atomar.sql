-- Phase 93: Rechnungsnummer-Vergabe und Rechnungs-Insert atomar zusammenfassen
--
-- Hintergrund (Bug-Report): app/api/invoices/route.ts zog bisher die
-- Rechnungsnummer per RPC next_invoice_number() (Zeile ~141) und schrieb
-- die Rechnung dann in einem SEPARATEN zweiten Request in die Tabelle
-- invoices (Zeile ~174). Die Nummernvergabe selbst ist zwar race-sicher
-- (next_invoice_number nutzt INSERT ... ON CONFLICT ... RETURNING), aber
-- beide Schritte waren NICHT als eine Transaktion verzahnt: schlägt der
-- zweite Request fehl (z.B. DB-Fehler, Netzwerkfehler, Validierungsfehler
-- in Postgres), ist die Nummer bereits "verbraucht" - eine Lücke im
-- GoBD-relevanten, fortlaufenden Rechnungsnummernkreis, ohne dass jemals
-- eine Rechnung mit dieser Nummer existiert hat.
--
-- Fix: EINE Postgres-Funktion, die Nummer ziehen UND Rechnung anlegen in
-- einem einzigen Funktionsaufruf erledigt. Ein RPC-Aufruf über PostgREST
-- läuft immer in genau einer Transaktion - schlägt der INSERT hier fehl,
-- wird die gesamte Funktion (inkl. der Nummernvergabe in
-- next_invoice_number) zurückgerollt. Damit kann keine Nummer mehr
-- "verbrennen", ohne dass eine zugehörige Rechnung existiert.
--
-- app/api/invoices/route.ts POST ruft ab jetzt NUR NOCH diese eine
-- Funktion auf (siehe zugehöriger Commit), statt Nummer + Insert getrennt
-- zu machen. WICHTIG: Diese Migration muss VOR dem App-Code-Deploy
-- ausgeführt werden, sonst schlägt das Anlegen neuer Rechnungen
-- kurzzeitig fehl (Funktion "create_invoice" nicht gefunden) - siehe
-- ähnlicher Vorfall bei phase-91 (Datenpflege-Ausfall).
--
-- REIN ADDITIV: next_invoice_number() bleibt unverändert bestehen (wird
-- von dieser neuen Funktion intern weiter genutzt), nichts wird entfernt.

CREATE OR REPLACE FUNCTION create_invoice(
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
