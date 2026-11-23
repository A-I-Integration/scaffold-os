-- Faktura Integrity Audit (Phase 129): atomare Zahlungs- und Gutschriftbuchung, Idempotenz
--
-- Hintergrund: Zahlung buchen/löschen und Gutschrift anlegen/stornieren/löschen liefen bisher als mehrere getrennte HTTP-Aufrufe ohne Transaktion.
-- Jetzt sperren die Datenbankfunktionen die Rechnungszeile (FOR UPDATE), prüfen den offenen Betrag, buchen und gleichen den Status in EINER Transaktion ab.
-- Gutschriften (Trigger) sperren dieselbe Rechnungszeile und gleichen den Status in ihrer eigenen Transaktion ab. Wer zuerst sperrt, gewinnt; der andere
-- sieht nach dem Warten den festgeschriebenen Stand (READ COMMITTED).
--
-- Fachliche Berechnung: faktura_offen_berechne() ist das SQL-Spiegelbild von lib/forderung.ts (berechneForderung für EINE Rechnung mit ihren Gutschriften).
-- Der Paritätstest in __tests__/e2e/faktura-e2e.test.ts (Abschnitt 8c, echte Datenbank) vergleicht beide über 300 Fälle. Änderungen an der Regel immer an BEIDEN Stellen.
--
-- Status-Regel (unverändert): gespeichert 'bezahlt' ⇔ es gibt gebuchte Zahlungen (paid_amount > 0) UND nichts ist mehr offen. Eine Gutschrift allein macht
-- eine Rechnung nicht zu 'bezahlt' (Anzeige: „ausgeglichen“). Stornierte Rechnungen/Gutschriften bleiben unberührt; Buchungen werden nie verändert.

-- ─── 1. Idempotenz ───
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS request_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_payments_request_key ON invoice_payments (request_key) WHERE request_key IS NOT NULL;

-- Schlüssel für wiederholte Anfragen (z. B. Gutschrift/Rechnung anlegen nach Netzwerkfehler): gleiche Anfrage → gleiche Antwort, keine Doppelbuchung
CREATE TABLE IF NOT EXISTS faktura_idempotenz (
  schluessel text PRIMARY KEY,
  art text NOT NULL,
  status text NOT NULL DEFAULT 'laeuft' CHECK (status IN ('laeuft', 'fertig')),
  antwort jsonb,
  http_status integer,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE faktura_idempotenz ENABLE ROW LEVEL SECURITY;

-- Beginnt eine Anfrage: 'neu' (Schlüssel angelegt, weiterarbeiten), 'fertig' (Antwort liegt vor), 'laeuft' (parallel in Arbeit, jünger als 2 Minuten).
-- Ein hängengebliebener Eintrag (älter als 2 Minuten, nie abgeschlossen) wird übernommen.
CREATE OR REPLACE FUNCTION faktura_idempotenz_start(p_schluessel text, p_art text) RETURNS jsonb AS $$
DECLARE z faktura_idempotenz%ROWTYPE; n integer;
BEGIN
  INSERT INTO faktura_idempotenz (schluessel, art) VALUES (p_schluessel, p_art) ON CONFLICT (schluessel) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN RETURN jsonb_build_object('zustand', 'neu'); END IF;
  SELECT * INTO z FROM faktura_idempotenz WHERE schluessel = p_schluessel FOR UPDATE;
  IF z.status = 'fertig' THEN
    RETURN jsonb_build_object('zustand', 'fertig', 'antwort', z.antwort, 'http_status', z.http_status);
  END IF;
  IF z.aktualisiert_am < now() - interval '2 minutes' THEN
    UPDATE faktura_idempotenz SET aktualisiert_am = now() WHERE schluessel = p_schluessel;
    RETURN jsonb_build_object('zustand', 'neu');
  END IF;
  RETURN jsonb_build_object('zustand', 'laeuft');
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION faktura_idempotenz_ende(p_schluessel text, p_antwort jsonb, p_http_status integer) RETURNS void AS $$
BEGIN
  IF p_http_status BETWEEN 200 AND 299 THEN
    UPDATE faktura_idempotenz SET status = 'fertig', antwort = p_antwort, http_status = p_http_status, aktualisiert_am = now() WHERE schluessel = p_schluessel;
  ELSE
    DELETE FROM faktura_idempotenz WHERE schluessel = p_schluessel;  -- Fehlschlag: die Wiederholung darf neu versuchen
  END IF;
END; $$ LANGUAGE plpgsql;

-- ─── 2. Offener Betrag (Spiegelbild von lib/forderung.ts für EINE Rechnung) ───
-- Parameter: Rechnungsbetrag brutto, gebuchte Zahlungen (paid_amount), gespeicherter Status, Summe der Gutschriften (Beträge, nicht storniert).
-- Rückgabe: offen (nach Gutschriften), verrechnete Gutschrift, Guthaben (Gutschriftüberhang + Überzahlung)
CREATE OR REPLACE FUNCTION faktura_offen_berechne(p_gross numeric, p_paid numeric, p_status text, p_gutschriften numeric,
                                                  OUT offen numeric, OUT gutschrift numeric, OUT guthaben numeric) AS $$
DECLARE
  gross numeric := COALESCE(p_gross, 0);
  p numeric := COALESCE(p_paid, 0);
  g numeric := COALESCE(p_gutschriften, 0);
  bezahlt numeric; rest numeric; ueberzahlung numeric := 0;
BEGIN
  IF gross < 0 THEN bezahlt := 0;
  ELSIF p_status = 'bezahlt' THEN bezahlt := CASE WHEN p > 0 THEN LEAST(p, gross) ELSE gross END;
  ELSE bezahlt := LEAST(GREATEST(p, 0), gross);
  END IF;
  IF p_status <> 'bezahlt' AND gross >= 0 AND p > gross + 0.005 THEN ueberzahlung := p - gross; END IF;
  rest := GREATEST(0, round(gross - bezahlt, 2));
  gutschrift := LEAST(g, rest);
  offen := round(rest - gutschrift, 2);
  guthaben := round((g - gutschrift) + ueberzahlung, 2);
END; $$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION faktura_gutschriften_summe(p_nummer text) RETURNS numeric AS $$
  SELECT COALESCE(SUM(abs(gross_amount)), 0) FROM invoices
  WHERE invoice_type = 'gutschrift' AND status <> 'storniert' AND p_nummer IS NOT NULL AND reference_invoice_number = p_nummer;
$$ LANGUAGE sql STABLE;

-- ─── 3. Zahlung buchen (atomar) ───
-- Ergebnis (jsonb): { ok: true, paid_amount, vollstaendig_bezahlt, wiederholt? } oder { ok: false, code, ... }
--   Codes: NICHT_GEFUNDEN, ZAHLUNG_AUF_STORNIERT, UEBER_OFFEN, KEY_KONFLIKT
CREATE OR REPLACE FUNCTION faktura_zahlung_buchen(p_invoice_id uuid, p_amount numeric, p_payment_date date, p_note text, p_request_key text) RETURNS jsonb AS $$
DECLARE
  inv invoices%ROWTYPE; alt invoice_payments%ROWTYPE; f record; neu_paid numeric; voll boolean; g numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('ok', false, 'code', 'BETRAG_UNGUELTIG'); END IF;
  SELECT * INTO inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;       -- ab hier gehört die Rechnung dieser Transaktion
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NICHT_GEFUNDEN'); END IF;

  IF p_request_key IS NOT NULL THEN                                          -- Wiederholung derselben Buchung → ursprüngliches Ergebnis, nichts doppelt
    SELECT * INTO alt FROM invoice_payments WHERE request_key = p_request_key;
    IF FOUND THEN
      IF alt.invoice_id <> p_invoice_id THEN RETURN jsonb_build_object('ok', false, 'code', 'KEY_KONFLIKT'); END IF;
      RETURN jsonb_build_object('ok', true, 'wiederholt', true, 'paid_amount', inv.paid_amount, 'vollstaendig_bezahlt', inv.status = 'bezahlt');
    END IF;
  END IF;

  IF inv.status = 'storniert' THEN RETURN jsonb_build_object('ok', false, 'code', 'ZAHLUNG_AUF_STORNIERT'); END IF;

  g := faktura_gutschriften_summe(inv.invoice_number);
  SELECT * INTO f FROM faktura_offen_berechne(inv.gross_amount, inv.paid_amount, inv.status, g);
  IF p_amount - f.offen > 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UEBER_OFFEN', 'offen', f.offen, 'gutschrift', f.gutschrift);
  END IF;

  neu_paid := round(inv.paid_amount + p_amount, 2);
  voll := f.offen - p_amount <= 0.01;
  INSERT INTO invoice_payments (invoice_id, amount, payment_date, note, request_key)
  VALUES (p_invoice_id, p_amount, COALESCE(p_payment_date, CURRENT_DATE), p_note, p_request_key);
  UPDATE invoices SET paid_amount = neu_paid,
                      status = CASE WHEN voll THEN 'bezahlt' WHEN status = 'bezahlt' THEN 'offen' ELSE status END,
                      updated_at = now()
   WHERE id = p_invoice_id;
  RETURN jsonb_build_object('ok', true, 'paid_amount', neu_paid, 'vollstaendig_bezahlt', voll);
END; $$ LANGUAGE plpgsql;

-- ─── 4. Zahlung löschen (Korrektur, atomar) ───
-- Die Zahlung wird entfernt, paid_amount und Status folgen der Forderung (Gutschriften berücksichtigt). Gutschriften bleiben unberührt.
CREATE OR REPLACE FUNCTION faktura_zahlung_loeschen(p_payment_id uuid) RETURNS jsonb AS $$
DECLARE
  pay invoice_payments%ROWTYPE; inv invoices%ROWTYPE; f record; neu_paid numeric; neuer_status text; g numeric;
BEGIN
  SELECT * INTO pay FROM invoice_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NICHT_GEFUNDEN'); END IF;
  SELECT * INTO inv FROM invoices WHERE id = pay.invoice_id FOR UPDATE;
  SELECT * INTO pay FROM invoice_payments WHERE id = p_payment_id FOR UPDATE;  -- nach dem Warten erneut: parallel schon gelöscht?
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NICHT_GEFUNDEN'); END IF;
  DELETE FROM invoice_payments WHERE id = p_payment_id;
  IF NOT FOUND OR inv.id IS NULL THEN RETURN jsonb_build_object('ok', true); END IF;

  neu_paid := GREATEST(0, round(inv.paid_amount - pay.amount, 2));
  neuer_status := inv.status;
  IF inv.status <> 'storniert' THEN
    g := faktura_gutschriften_summe(inv.invoice_number);
    SELECT * INTO f FROM faktura_offen_berechne(inv.gross_amount, neu_paid, CASE WHEN inv.status = 'bezahlt' THEN 'offen' ELSE inv.status END, g);
    neuer_status := CASE WHEN neu_paid > 0 AND f.offen <= 0.01 THEN 'bezahlt' WHEN inv.status = 'bezahlt' THEN 'offen' ELSE inv.status END;
  END IF;
  UPDATE invoices SET paid_amount = neu_paid, status = neuer_status, updated_at = now() WHERE id = inv.id;
  RETURN jsonb_build_object('ok', true, 'paid_amount', neu_paid, 'status', neuer_status);
END; $$ LANGUAGE plpgsql;

-- ─── 5. Gutschrift angelegt / geändert / storniert / gelöscht → Status der Bezugsrechnung (atomar, im selben Befehl) ───
CREATE OR REPLACE FUNCTION faktura_status_abgleichen(p_nummer text) RETURNS void AS $$
DECLARE inv invoices%ROWTYPE; f record; soll text;
BEGIN
  IF p_nummer IS NULL OR p_nummer = '' THEN RETURN; END IF;
  SELECT * INTO inv FROM invoices WHERE invoice_number = p_nummer AND invoice_type <> 'gutschrift' AND status <> 'storniert' ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO f FROM faktura_offen_berechne(inv.gross_amount, inv.paid_amount, inv.status, faktura_gutschriften_summe(p_nummer));
  soll := CASE WHEN inv.paid_amount > 0 AND f.offen <= 0.01 THEN 'bezahlt' WHEN inv.status = 'bezahlt' AND f.offen > 0.01 THEN 'offen' ELSE inv.status END;
  IF soll <> inv.status THEN
    UPDATE invoices SET status = soll, updated_at = now() WHERE id = inv.id;
    INSERT INTO abrechnung_historie (aktion, invoice_id, invoice_number, project_id, grund, details)
    VALUES ('status_geaendert', inv.id, inv.invoice_number, inv.project_id, 'Status nach Änderung an Gutschriften abgeglichen',
            jsonb_build_object('status', jsonb_build_object('von', inv.status, 'auf', soll), 'offen', f.offen, 'gutschrift', f.gutschrift));
  END IF;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION faktura_gutschrift_trigger() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.invoice_type = 'gutschrift' THEN PERFORM faktura_status_abgleichen(OLD.reference_invoice_number); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.invoice_type = 'gutschrift'
     AND (TG_OP = 'INSERT' OR OLD.invoice_type IS DISTINCT FROM 'gutschrift' OR NEW.reference_invoice_number IS DISTINCT FROM OLD.reference_invoice_number) THEN
    PERFORM faktura_status_abgleichen(NEW.reference_invoice_number);
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS faktura_gutschrift_abgleich ON invoices;
DROP TRIGGER IF EXISTS faktura_gutschrift_abgleich_ins ON invoices;
DROP TRIGGER IF EXISTS faktura_gutschrift_abgleich_upd ON invoices;
DROP TRIGGER IF EXISTS faktura_gutschrift_abgleich_del ON invoices;
CREATE TRIGGER faktura_gutschrift_abgleich_ins AFTER INSERT ON invoices
  FOR EACH ROW WHEN (NEW.invoice_type = 'gutschrift') EXECUTE FUNCTION faktura_gutschrift_trigger();
CREATE TRIGGER faktura_gutschrift_abgleich_upd AFTER UPDATE OF status, gross_amount, reference_invoice_number, invoice_type ON invoices
  FOR EACH ROW WHEN (OLD.invoice_type = 'gutschrift' OR NEW.invoice_type = 'gutschrift') EXECUTE FUNCTION faktura_gutschrift_trigger();
CREATE TRIGGER faktura_gutschrift_abgleich_del AFTER DELETE ON invoices
  FOR EACH ROW WHEN (OLD.invoice_type = 'gutschrift') EXECUTE FUNCTION faktura_gutschrift_trigger();

-- Kontrolle: muss die Funktionen und den Trigger zeigen
SELECT proname FROM pg_proc WHERE proname IN ('faktura_zahlung_buchen', 'faktura_zahlung_loeschen', 'faktura_offen_berechne', 'faktura_status_abgleichen', 'faktura_idempotenz_start') ORDER BY 1;
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'faktura_gutschrift_abgleich%' ORDER BY 1;
