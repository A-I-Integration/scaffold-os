-- Faktura Phase 130: Idempotenz mit Anker, manuelles „Als bezahlt“ über die Datenbank, Rechte der Funktionen
--
-- Voraussetzungen: phase-38 (invoice_payments), phase-93/94 (create_invoice, create_invoice_as_new_version), phase-125 (abrechnung_historie),
-- phase-128 (rechnung_anlegen_zugeordnet), phase-129 (faktura_*-Grundfunktionen). Mehrfach ausführbar. Läuft in EINER Transaktion: bei einem Fehler
-- bleibt nichts halb angewendet.
--
-- 1. Idempotenz ohne Zeitstempel-Übernahme: Der Schlüssel wird mit der angelegten Rechnung in EINER Transaktion festgeschrieben
--    (faktura_anlegen_idempotent). Zustände: laeuft → angelegt (Rechnung committet, Anker invoice_id) → fertig (Antwort gespeichert).
--    Ein Schlüssel MIT Anker gibt immer das ursprüngliche Ergebnis zurück. Ein Schlüssel OHNE Anker kann gefahrlos erneut ausgeführt werden: der
--    Advisory-Lock je Schlüssel und der Anker verhindern auch bei Überschneidung eine zweite Rechnung. Nutzdaten-Hash erkennt Schlüsselkonflikte.
-- 2. Manuelles „Als bezahlt“/„Zurück auf offen“: faktura_status_setzen (Zeilensperre, zentrale Berechnung, echte Zahlungszeile, Verlauf mit Benutzer).
-- 3. Rechte: alle faktura_*-Funktionen nur für service_role; Tabelle faktura_idempotenz nur für service_role.
-- Die SQL-Berechnung faktura_offen_berechne (phase-129) bleibt das Spiegelbild von lib/forderung.ts (Paritätstest im E2E).

BEGIN;

-- ─── 1. Spalten ───
ALTER TABLE faktura_idempotenz ADD COLUMN IF NOT EXISTS nutzdaten_hash text;
ALTER TABLE faktura_idempotenz ADD COLUMN IF NOT EXISTS lease_bis timestamptz;
ALTER TABLE faktura_idempotenz ADD COLUMN IF NOT EXISTS invoice_id uuid;          -- Anker: die mit diesem Schlüssel angelegte Rechnung (bewusst ohne Fremdschlüssel)
ALTER TABLE faktura_idempotenz ADD COLUMN IF NOT EXISTS versuche integer NOT NULL DEFAULT 1;
ALTER TABLE faktura_idempotenz DROP CONSTRAINT IF EXISTS faktura_idempotenz_status_check;
ALTER TABLE faktura_idempotenz ADD CONSTRAINT faktura_idempotenz_status_check CHECK (status IN ('laeuft', 'angelegt', 'fertig'));
CREATE INDEX IF NOT EXISTS faktura_idempotenz_alter_idx ON faktura_idempotenz (status, aktualisiert_am);

ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS quelle text;                -- z. B. 'manuell_bezahlt' (durch „Als bezahlt“ gebucht); sonst NULL

-- ─── 2. Schlüssel: Start, Anlegen mit Anker, Ende, Bereinigung ───
DROP FUNCTION IF EXISTS faktura_idempotenz_start(text, text);

-- Zustand: 'neu' | 'laeuft' (jünger als die Frist) | 'wiederaufnahme' (Frist abgelaufen, KEIN Anker) | 'angelegt' (Anker vorhanden) | 'fertig' | 'konflikt'
CREATE OR REPLACE FUNCTION faktura_idempotenz_start(p_schluessel text, p_art text, p_hash text DEFAULT NULL) RETURNS jsonb AS $$
DECLARE z faktura_idempotenz%ROWTYPE; n integer;
BEGIN
  INSERT INTO faktura_idempotenz (schluessel, art, nutzdaten_hash, lease_bis)
  VALUES (p_schluessel, p_art, p_hash, now() + interval '2 minutes') ON CONFLICT (schluessel) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN RETURN jsonb_build_object('zustand', 'neu'); END IF;
  SELECT * INTO z FROM faktura_idempotenz WHERE schluessel = p_schluessel FOR UPDATE;
  IF z.nutzdaten_hash IS NOT NULL AND p_hash IS NOT NULL AND z.nutzdaten_hash <> p_hash THEN RETURN jsonb_build_object('zustand', 'konflikt'); END IF;
  IF z.status = 'fertig' THEN RETURN jsonb_build_object('zustand', 'fertig', 'antwort', z.antwort, 'http_status', z.http_status); END IF;
  IF z.status = 'angelegt' OR z.invoice_id IS NOT NULL THEN RETURN jsonb_build_object('zustand', 'angelegt', 'invoice_id', z.invoice_id); END IF;
  IF COALESCE(z.lease_bis, z.aktualisiert_am + interval '2 minutes') > now() THEN RETURN jsonb_build_object('zustand', 'laeuft'); END IF;
  -- Frist abgelaufen und kein Anker: der Vorgang ist abgestürzt ODER noch langsam. Beides ist gefahrlos, weil faktura_anlegen_idempotent
  -- (Advisory-Lock + Anker) eine zweite Rechnung ausschließt. Es wird nicht blind übernommen, sondern am Anker geprüft.
  UPDATE faktura_idempotenz SET lease_bis = now() + interval '2 minutes', versuche = versuche + 1, aktualisiert_am = now() WHERE schluessel = p_schluessel;
  RETURN jsonb_build_object('zustand', 'wiederaufnahme');
END; $$ LANGUAGE plpgsql;

-- Rechnung/Gutschrift anlegen UND Schlüssel festschreiben in EINER Transaktion. p_ziel: eine der vorhandenen Anlegefunktionen, p_args: ihre benannten Parameter.
-- Ergebnis: { ok: true, neu: true|false, invoice: {...} } oder { ok: false, code: 'KEY_KONFLIKT' | 'GELOESCHT' }
CREATE OR REPLACE FUNCTION faktura_anlegen_idempotent(p_schluessel text, p_hash text, p_ziel text, p_args jsonb) RETURNS jsonb AS $$
DECLARE z faktura_idempotenz%ROWTYPE; v_args text; v_json jsonb; v_id uuid;
BEGIN
  IF p_ziel NOT IN ('create_invoice', 'create_invoice_as_new_version', 'rechnung_anlegen_zugeordnet') THEN RAISE EXCEPTION 'ziel_ungueltig'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_schluessel, 0));          -- parallele Anfragen mit demselben Schlüssel laufen nacheinander
  SELECT * INTO z FROM faktura_idempotenz WHERE schluessel = p_schluessel FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO faktura_idempotenz (schluessel, art, nutzdaten_hash, lease_bis) VALUES (p_schluessel, 'rechnung_anlegen', p_hash, now() + interval '2 minutes');
    SELECT * INTO z FROM faktura_idempotenz WHERE schluessel = p_schluessel FOR UPDATE;
  END IF;
  IF z.nutzdaten_hash IS NOT NULL AND p_hash IS NOT NULL AND z.nutzdaten_hash <> p_hash THEN RETURN jsonb_build_object('ok', false, 'code', 'KEY_KONFLIKT'); END IF;
  IF z.invoice_id IS NOT NULL THEN                                            -- Anker vorhanden: nichts erneut anlegen
    SELECT to_jsonb(i) INTO v_json FROM invoices i WHERE i.id = z.invoice_id;
    IF v_json IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'GELOESCHT'); END IF;
    RETURN jsonb_build_object('ok', true, 'neu', false, 'invoice', v_json);
  END IF;

  SELECT string_agg(format('%I => %L', k, p_args ->> k), ', ') INTO v_args FROM jsonb_object_keys(p_args) AS k;
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I(%s) AS r', p_ziel, v_args) INTO v_json;
  v_id := (v_json ->> 'id')::uuid;
  UPDATE faktura_idempotenz SET status = 'angelegt', invoice_id = v_id, nutzdaten_hash = COALESCE(nutzdaten_hash, p_hash), aktualisiert_am = now() WHERE schluessel = p_schluessel;
  RETURN jsonb_build_object('ok', true, 'neu', true, 'invoice', v_json);
END; $$ LANGUAGE plpgsql;

-- Antwort speichern. Ein Fehlschlag löscht den Schlüssel NUR, wenn noch nichts angelegt wurde (kein Anker); mit Anker bleibt er bestehen.
CREATE OR REPLACE FUNCTION faktura_idempotenz_ende(p_schluessel text, p_antwort jsonb, p_http_status integer) RETURNS void AS $$
BEGIN
  IF p_http_status BETWEEN 200 AND 299 THEN
    UPDATE faktura_idempotenz SET status = 'fertig', antwort = p_antwort, http_status = p_http_status, aktualisiert_am = now() WHERE schluessel = p_schluessel;
  ELSE
    DELETE FROM faktura_idempotenz WHERE schluessel = p_schluessel AND invoice_id IS NULL AND status = 'laeuft';
  END IF;
END; $$ LANGUAGE plpgsql;

-- Bereinigung: nur abgeschlossene Schlüssel nach p_fertig_tage und leere (nie angelegte, abgelaufene) nach p_leer_tage. Laufende (Frist nicht abgelaufen) und
-- jüngere Einträge bleiben immer. Mindestens 1 Tag. Rückgabe: Anzahl je Art.
CREATE OR REPLACE FUNCTION faktura_idempotenz_bereinigen(p_fertig_tage integer DEFAULT 90, p_leer_tage integer DEFAULT 7) RETURNS jsonb AS $$
DECLARE a integer; b integer; c integer;
BEGIN
  p_fertig_tage := GREATEST(COALESCE(p_fertig_tage, 90), 1); p_leer_tage := GREATEST(COALESCE(p_leer_tage, 7), 1);
  DELETE FROM faktura_idempotenz WHERE status = 'fertig' AND aktualisiert_am < now() - make_interval(days => p_fertig_tage);
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM faktura_idempotenz WHERE status = 'angelegt' AND aktualisiert_am < now() - make_interval(days => p_fertig_tage);
  GET DIAGNOSTICS b = ROW_COUNT;
  DELETE FROM faktura_idempotenz WHERE status = 'laeuft' AND invoice_id IS NULL AND COALESCE(lease_bis, aktualisiert_am) < now()
     AND aktualisiert_am < now() - make_interval(days => p_leer_tage);
  GET DIAGNOSTICS c = ROW_COUNT;
  RETURN jsonb_build_object('fertig', a, 'angelegt', b, 'leer', c);
END; $$ LANGUAGE plpgsql;

-- ─── 3. Zahlung buchen: Schlüsselkonflikt auch bei anderem Betrag/Datum, Quelle ───
DROP FUNCTION IF EXISTS faktura_zahlung_buchen(uuid, numeric, date, text, text);
CREATE OR REPLACE FUNCTION faktura_zahlung_buchen(p_invoice_id uuid, p_amount numeric, p_payment_date date, p_note text, p_request_key text, p_quelle text DEFAULT NULL) RETURNS jsonb AS $$
DECLARE
  inv invoices%ROWTYPE; alt invoice_payments%ROWTYPE; f record; neu_paid numeric; voll boolean; g numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('ok', false, 'code', 'BETRAG_UNGUELTIG'); END IF;
  SELECT * INTO inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NICHT_GEFUNDEN'); END IF;

  IF p_request_key IS NOT NULL THEN
    SELECT * INTO alt FROM invoice_payments WHERE request_key = p_request_key;
    IF FOUND THEN
      IF alt.invoice_id <> p_invoice_id OR alt.amount <> round(p_amount, 2) OR (p_payment_date IS NOT NULL AND alt.payment_date <> p_payment_date) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'KEY_KONFLIKT');          -- derselbe Schlüssel, andere Nutzdaten
      END IF;
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
  INSERT INTO invoice_payments (invoice_id, amount, payment_date, note, request_key, quelle)
  VALUES (p_invoice_id, p_amount, COALESCE(p_payment_date, CURRENT_DATE), p_note, p_request_key, p_quelle);
  UPDATE invoices SET paid_amount = neu_paid,
                      status = CASE WHEN voll THEN 'bezahlt' WHEN status = 'bezahlt' THEN 'offen' ELSE status END,
                      updated_at = now()
   WHERE id = p_invoice_id;
  RETURN jsonb_build_object('ok', true, 'paid_amount', neu_paid, 'vollstaendig_bezahlt', voll);
END; $$ LANGUAGE plpgsql;

-- ─── 4. Manuelles „Als bezahlt“ / „Zurück auf offen“ (atomar, mit Verlauf) ───
-- 'bezahlt': bucht den noch OFFENEN Rest (nach Gutschriften) als echte Zahlung (quelle 'manuell_bezahlt'). Ist nichts offen, wird KEINE Zahlung erfunden.
-- 'offen':   nimmt nur Zahlungen zurück, die durch „Als bezahlt“ entstanden sind. Andere Zahlungen bleiben (Code ZAHLUNGEN_VORHANDEN): gezielt korrigieren.
-- Codes: NICHT_GEFUNDEN, ZAHLUNG_AUF_STORNIERT, STORNIERT_FINAL, GUTSCHRIFT_KEINE_ZAHLUNG, ZAHLUNGEN_VORHANDEN, ZIEL_UNGUELTIG
CREATE OR REPLACE FUNCTION faktura_status_setzen(p_invoice_id uuid, p_ziel text, p_user uuid DEFAULT NULL, p_grund text DEFAULT NULL) RETURNS jsonb AS $$
DECLARE
  inv invoices%ROWTYPE; f record; g numeric; erg jsonb; manuell numeric; st_neu text;
BEGIN
  IF p_ziel NOT IN ('bezahlt', 'offen') THEN RETURN jsonb_build_object('ok', false, 'code', 'ZIEL_UNGUELTIG'); END IF;
  SELECT * INTO inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NICHT_GEFUNDEN'); END IF;
  IF inv.status = 'storniert' THEN
    RETURN jsonb_build_object('ok', false, 'code', CASE WHEN p_ziel = 'bezahlt' THEN 'ZAHLUNG_AUF_STORNIERT' ELSE 'STORNIERT_FINAL' END);
  END IF;
  IF inv.invoice_type = 'gutschrift' THEN
    IF p_ziel = 'offen' THEN RETURN jsonb_build_object('ok', true, 'status', inv.status, 'gebucht', 0); END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'GUTSCHRIFT_KEINE_ZAHLUNG');
  END IF;

  IF p_ziel = 'bezahlt' THEN
    g := faktura_gutschriften_summe(inv.invoice_number);
    SELECT * INTO f FROM faktura_offen_berechne(inv.gross_amount, inv.paid_amount, inv.status, g);
    IF f.offen > 0.01 THEN
      erg := faktura_zahlung_buchen(p_invoice_id, f.offen, CURRENT_DATE, 'Als bezahlt markiert' || COALESCE(': ' || p_grund, ''), NULL, 'manuell_bezahlt');
      IF NOT COALESCE((erg ->> 'ok')::boolean, false) THEN RETURN erg; END IF;
      INSERT INTO abrechnung_historie (aktion, invoice_id, invoice_number, project_id, user_id, grund, details)
      VALUES ('zahlung_geaendert', inv.id, inv.invoice_number, inv.project_id, p_user, COALESCE(p_grund, 'Manuell als bezahlt markiert'),
              jsonb_build_object('status', jsonb_build_object('von', inv.status, 'auf', 'bezahlt'),
                                 'bezahlt', jsonb_build_object('von', inv.paid_amount, 'auf', (erg ->> 'paid_amount')::numeric), 'gebucht', f.offen, 'gutschrift', f.gutschrift));
      RETURN jsonb_build_object('ok', true, 'status', 'bezahlt', 'gebucht', f.offen, 'paid_amount', (erg ->> 'paid_amount')::numeric);
    END IF;
    -- nichts mehr offen: keine Zahlung erfinden. Gebuchte Zahlung + nichts offen = bezahlt; nur Gutschrift = „ausgeglichen“ (Status bleibt)
    st_neu := CASE WHEN inv.paid_amount > 0 THEN 'bezahlt' ELSE inv.status END;
    IF st_neu <> inv.status THEN
      UPDATE invoices SET status = st_neu, updated_at = now() WHERE id = inv.id;
      INSERT INTO abrechnung_historie (aktion, invoice_id, invoice_number, project_id, user_id, grund, details)
      VALUES ('status_geaendert', inv.id, inv.invoice_number, inv.project_id, p_user, COALESCE(p_grund, 'Manuell als bezahlt markiert (nichts mehr offen)'),
              jsonb_build_object('status', jsonb_build_object('von', inv.status, 'auf', st_neu)));
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', st_neu, 'gebucht', 0, 'ausgeglichen', inv.paid_amount <= 0);
  END IF;

  -- p_ziel = 'offen'
  IF EXISTS (SELECT 1 FROM invoice_payments WHERE invoice_id = inv.id AND quelle IS DISTINCT FROM 'manuell_bezahlt') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ZAHLUNGEN_VORHANDEN');
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO manuell FROM invoice_payments WHERE invoice_id = inv.id AND quelle = 'manuell_bezahlt';
  DELETE FROM invoice_payments WHERE invoice_id = inv.id AND quelle = 'manuell_bezahlt';
  IF inv.status = 'offen' AND inv.paid_amount = 0 AND manuell = 0 THEN RETURN jsonb_build_object('ok', true, 'status', 'offen', 'gebucht', 0); END IF;
  UPDATE invoices SET paid_amount = 0, status = 'offen', updated_at = now() WHERE id = inv.id;   -- ohne weitere Zahlungszeilen ist paid_amount 0 (auch bei älteren Daten ohne Zahlungszeilen)
  INSERT INTO abrechnung_historie (aktion, invoice_id, invoice_number, project_id, user_id, grund, details)
  VALUES ('status_geaendert', inv.id, inv.invoice_number, inv.project_id, p_user, COALESCE(p_grund, 'Manuell auf offen gesetzt'),
          jsonb_build_object('status', jsonb_build_object('von', inv.status, 'auf', 'offen'),
                             'bezahlt', jsonb_build_object('von', inv.paid_amount, 'auf', 0), 'zurueckgenommen', manuell));
  RETURN jsonb_build_object('ok', true, 'status', 'offen', 'zurueckgenommen', manuell);
END; $$ LANGUAGE plpgsql;

-- ─── 5. Trigger-Funktionen mit festen Rechten (laufen als Eigentümer; nur der Trigger ruft sie) ───
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
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION faktura_gutschrift_trigger() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.invoice_type = 'gutschrift' THEN PERFORM faktura_status_abgleichen(OLD.reference_invoice_number); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.invoice_type = 'gutschrift'
     AND (TG_OP = 'INSERT' OR OLD.invoice_type IS DISTINCT FROM 'gutschrift' OR NEW.reference_invoice_number IS DISTINCT FROM OLD.reference_invoice_number) THEN
    PERFORM faktura_status_abgleichen(NEW.reference_invoice_number);
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ─── 6. Rechte: Die Buchungsfunktionen sind nur für die Server-Rolle (service_role) aufrufbar, nicht über die öffentliche API ───
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'faktura\_%' ESCAPE '\' AND p.prokind = 'f' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
  END LOOP;
  EXECUTE 'REVOKE ALL ON TABLE public.faktura_idempotenz FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON TABLE public.faktura_idempotenz FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE public.faktura_idempotenz FROM authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE 'GRANT ALL ON TABLE public.faktura_idempotenz TO service_role'; END IF;
END $$;

-- Kontrolle: muss die Funktionen und die Spalten zeigen
SELECT proname FROM pg_proc WHERE proname IN ('faktura_anlegen_idempotent', 'faktura_status_setzen', 'faktura_idempotenz_bereinigen', 'faktura_idempotenz_start') ORDER BY 1;
SELECT column_name FROM information_schema.columns WHERE table_name = 'faktura_idempotenz' AND column_name IN ('nutzdaten_hash', 'lease_bis', 'invoice_id') ORDER BY 1;

COMMIT;
