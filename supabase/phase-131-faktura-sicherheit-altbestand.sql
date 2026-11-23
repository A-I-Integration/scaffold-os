-- Faktura Phase 131: Altbestand der Idempotenzschlüssel, „Zurück auf offen“ ohne Datenverlust, Rechte der älteren Buchungsfunktionen
--
-- Voraussetzungen: phase-93/94 (create_invoice, create_invoice_as_new_version), phase-125 (abrechnung_historie), phase-128, phase-129, phase-130.
-- Mehrfach ausführbar, läuft in EINER Transaktion. Es werden KEINE bestehenden Buchungen (invoices, invoice_payments, abrechnung_historie) verändert
-- und keine Funktion gelöscht. Befund und Begründung: docs/faktura-phase-130-security-befund.md
--
-- 1. Altbestand in faktura_idempotenz (vor Phase 130 angelegt, ohne Nutzdaten-Hash): wird markiert (herkunft = 'phase129'), der Rechnungsanker wird aus der
--    gespeicherten Antwort nachgetragen, wenn die Rechnung existiert, und alles wird in faktura_migration_protokoll festgehalten. Ein Altschlüssel wird nie als
--    Wiederholung für beliebige neue Nutzdaten akzeptiert (fertig → „alt_fertig“, ungeklärt → „alt_unklar“); er wird nie automatisch neu ausgeführt.
-- 2. faktura_status_setzen('offen'): setzt paid_amount nur zurück, wenn es der Summe der manuell gebuchten Zahlungen entspricht. Reguläre Zahlungen bleiben
--    immer unangetastet. Abweichung → Abbruch mit ZAHLUNG_ABWEICHUNG. Rücknahme UND Ablehnung stehen im Verlauf.
-- 3. Rechte: create_invoice, create_invoice_as_new_version und next_invoice_number nur noch für service_role (alle Aufrufe im Code laufen mit dem Service-Schlüssel).

BEGIN;

-- ─── 1. Altbestand ───
ALTER TABLE faktura_idempotenz ADD COLUMN IF NOT EXISTS herkunft text;     -- 'phase129' = vor Phase 130 angelegt (kein Nutzdaten-Hash)

CREATE TABLE IF NOT EXISTS faktura_migration_protokoll (
  id bigserial PRIMARY KEY,
  phase text NOT NULL,
  aktion text NOT NULL,
  anzahl integer NOT NULL,
  details jsonb,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE faktura_migration_protokoll ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE n_alt integer; n_anker integer; n_fertig integer; n_laeuft integer;
BEGIN
  -- a) Altzeilen (ohne Hash, noch ohne Herkunft) markieren
  WITH m AS (UPDATE faktura_idempotenz SET herkunft = 'phase129' WHERE nutzdaten_hash IS NULL AND herkunft IS NULL RETURNING status)
  SELECT count(*), count(*) FILTER (WHERE status = 'fertig'), count(*) FILTER (WHERE status = 'laeuft') INTO n_alt, n_fertig, n_laeuft FROM m;
  -- b) Anker aus der gespeicherten Antwort nachtragen, aber nur, wenn die Rechnung wirklich existiert
  WITH x AS (
    SELECT s.schluessel, CASE WHEN s.rid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN s.rid::uuid END AS rid
      FROM (SELECT schluessel, antwort -> 'invoice' ->> 'id' AS rid FROM faktura_idempotenz
             WHERE herkunft = 'phase129' AND invoice_id IS NULL AND status = 'fertig' AND antwort IS NOT NULL) s
  ), u AS (
    UPDATE faktura_idempotenz z SET invoice_id = x.rid FROM x JOIN invoices i ON i.id = x.rid WHERE z.schluessel = x.schluessel RETURNING z.schluessel
  )
  SELECT count(*) INTO n_anker FROM u;
  IF n_alt > 0 OR n_anker > 0 THEN
    INSERT INTO faktura_migration_protokoll (phase, aktion, anzahl, details)
    VALUES ('131', 'idempotenz_altbestand', n_alt, jsonb_build_object('fertig', n_fertig, 'laeuft', n_laeuft, 'anker_nachgetragen', n_anker,
            'hinweis', 'fertig → alt_fertig (409, Rechnung vorhanden); laeuft → alt_unklar (409, manuell prüfen); keine Zeile gelöscht'));
  END IF;
END $$;

-- Zustand: neu | laeuft | wiederaufnahme | angelegt | fertig | konflikt | alt_fertig | alt_unklar | hash_fehlt
CREATE OR REPLACE FUNCTION faktura_idempotenz_start(p_schluessel text, p_art text, p_hash text DEFAULT NULL) RETURNS jsonb AS $$
DECLARE z faktura_idempotenz%ROWTYPE; n integer;
BEGIN
  IF p_hash IS NULL OR p_hash = '' THEN RETURN jsonb_build_object('zustand', 'hash_fehlt'); END IF;
  INSERT INTO faktura_idempotenz (schluessel, art, nutzdaten_hash, lease_bis)
  VALUES (p_schluessel, p_art, p_hash, now() + interval '2 minutes') ON CONFLICT (schluessel) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN RETURN jsonb_build_object('zustand', 'neu'); END IF;
  SELECT * INTO z FROM faktura_idempotenz WHERE schluessel = p_schluessel FOR UPDATE;
  -- Altbestand (ohne Hash): nie für beliebige neue Nutzdaten als Wiederholung akzeptieren, nie automatisch neu ausführen
  IF z.herkunft IS NOT NULL OR z.nutzdaten_hash IS NULL THEN
    IF z.status = 'fertig' THEN RETURN jsonb_build_object('zustand', 'alt_fertig', 'invoice_id', z.invoice_id); END IF;
    RETURN jsonb_build_object('zustand', 'alt_unklar', 'invoice_id', z.invoice_id);
  END IF;
  IF z.nutzdaten_hash <> p_hash THEN RETURN jsonb_build_object('zustand', 'konflikt'); END IF;
  IF z.status = 'fertig' THEN RETURN jsonb_build_object('zustand', 'fertig', 'antwort', z.antwort, 'http_status', z.http_status); END IF;
  IF z.status = 'angelegt' OR z.invoice_id IS NOT NULL THEN RETURN jsonb_build_object('zustand', 'angelegt', 'invoice_id', z.invoice_id); END IF;
  IF COALESCE(z.lease_bis, z.aktualisiert_am + interval '2 minutes') > now() THEN RETURN jsonb_build_object('zustand', 'laeuft'); END IF;
  UPDATE faktura_idempotenz SET lease_bis = now() + interval '2 minutes', versuche = versuche + 1, aktualisiert_am = now() WHERE schluessel = p_schluessel;
  RETURN jsonb_build_object('zustand', 'wiederaufnahme');
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION faktura_anlegen_idempotent(p_schluessel text, p_hash text, p_ziel text, p_args jsonb) RETURNS jsonb AS $$
DECLARE z faktura_idempotenz%ROWTYPE; v_args text; v_json jsonb; v_id uuid;
BEGIN
  IF p_ziel NOT IN ('create_invoice', 'create_invoice_as_new_version', 'rechnung_anlegen_zugeordnet') THEN RAISE EXCEPTION 'ziel_ungueltig'; END IF;
  IF p_hash IS NULL OR p_hash = '' THEN RETURN jsonb_build_object('ok', false, 'code', 'HASH_FEHLT'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_schluessel, 0));
  SELECT * INTO z FROM faktura_idempotenz WHERE schluessel = p_schluessel FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO faktura_idempotenz (schluessel, art, nutzdaten_hash, lease_bis) VALUES (p_schluessel, 'rechnung_anlegen', p_hash, now() + interval '2 minutes');
    SELECT * INTO z FROM faktura_idempotenz WHERE schluessel = p_schluessel FOR UPDATE;
  END IF;
  IF z.herkunft IS NOT NULL OR z.nutzdaten_hash IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'ALTER_SCHLUESSEL', 'invoice_id', z.invoice_id); END IF;
  IF z.nutzdaten_hash <> p_hash THEN RETURN jsonb_build_object('ok', false, 'code', 'KEY_KONFLIKT'); END IF;
  IF z.invoice_id IS NOT NULL THEN
    SELECT to_jsonb(i) INTO v_json FROM invoices i WHERE i.id = z.invoice_id;
    IF v_json IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'GELOESCHT'); END IF;
    RETURN jsonb_build_object('ok', true, 'neu', false, 'invoice', v_json);
  END IF;

  SELECT string_agg(format('%I => %L', k, p_args ->> k), ', ') INTO v_args FROM jsonb_object_keys(p_args) AS k;
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I(%s) AS r', p_ziel, v_args) INTO v_json;
  v_id := (v_json ->> 'id')::uuid;
  UPDATE faktura_idempotenz SET status = 'angelegt', invoice_id = v_id, aktualisiert_am = now() WHERE schluessel = p_schluessel;
  RETURN jsonb_build_object('ok', true, 'neu', true, 'invoice', v_json);
END; $$ LANGUAGE plpgsql;

-- Bereinigung: Altbestand wird NUR gelöscht, wenn er abgeschlossen ist und einen geprüften Anker auf eine vorhandene Rechnung hat; ungeklärter Altbestand bleibt.
CREATE OR REPLACE FUNCTION faktura_idempotenz_bereinigen(p_fertig_tage integer DEFAULT 90, p_leer_tage integer DEFAULT 7) RETURNS jsonb AS $$
DECLARE a integer; b integer; c integer; d integer; e integer;
BEGIN
  p_fertig_tage := GREATEST(COALESCE(p_fertig_tage, 90), 1); p_leer_tage := GREATEST(COALESCE(p_leer_tage, 7), 1);
  DELETE FROM faktura_idempotenz WHERE status = 'fertig' AND herkunft IS NULL AND nutzdaten_hash IS NOT NULL AND aktualisiert_am < now() - make_interval(days => p_fertig_tage);
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM faktura_idempotenz WHERE status = 'angelegt' AND herkunft IS NULL AND nutzdaten_hash IS NOT NULL AND aktualisiert_am < now() - make_interval(days => p_fertig_tage);
  GET DIAGNOSTICS b = ROW_COUNT;
  DELETE FROM faktura_idempotenz WHERE status = 'laeuft' AND invoice_id IS NULL AND herkunft IS NULL AND nutzdaten_hash IS NOT NULL
     AND COALESCE(lease_bis, aktualisiert_am) < now() AND aktualisiert_am < now() - make_interval(days => p_leer_tage);
  GET DIAGNOSTICS c = ROW_COUNT;
  DELETE FROM faktura_idempotenz z WHERE z.status = 'fertig' AND (z.herkunft IS NOT NULL OR z.nutzdaten_hash IS NULL) AND z.invoice_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = z.invoice_id) AND z.aktualisiert_am < now() - make_interval(days => p_fertig_tage);
  GET DIAGNOSTICS d = ROW_COUNT;
  SELECT count(*) INTO e FROM faktura_idempotenz WHERE herkunft IS NOT NULL OR nutzdaten_hash IS NULL;
  RETURN jsonb_build_object('fertig', a, 'angelegt', b, 'leer', c, 'altbestand_geprueft', d, 'altbestand_bleibt', e);
END; $$ LANGUAGE plpgsql;

-- ─── 2. „Zurück auf offen“ ohne Datenverlust ───
-- Neu gegenüber Phase 130: Abgleich paid_amount ↔ Summe der manuellen Zahlungszeilen, Fehlercode ZAHLUNG_ABWEICHUNG, Verlauf auch bei Ablehnung,
-- Verlauf der Rücknahme mit den entfernten Zahlungszeilen. Der Zweig „bezahlt“ ist unverändert.
CREATE OR REPLACE FUNCTION faktura_status_setzen(p_invoice_id uuid, p_ziel text, p_user uuid DEFAULT NULL, p_grund text DEFAULT NULL) RETURNS jsonb AS $$
DECLARE
  inv invoices%ROWTYPE; f record; g numeric; erg jsonb; manuell numeric; st_neu text; regulaer integer; entfernt jsonb;
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
  SELECT count(*) INTO regulaer FROM invoice_payments WHERE invoice_id = inv.id AND quelle IS DISTINCT FROM 'manuell_bezahlt';
  SELECT COALESCE(SUM(amount), 0) INTO manuell FROM invoice_payments WHERE invoice_id = inv.id AND quelle = 'manuell_bezahlt';
  IF regulaer > 0 THEN                                                       -- reguläre Zahlungen werden NIE gelöscht oder verändert
    INSERT INTO abrechnung_historie (aktion, invoice_id, invoice_number, project_id, user_id, grund, details)
    VALUES ('status_geaendert', inv.id, inv.invoice_number, inv.project_id, p_user, 'Zurücksetzen auf offen abgelehnt',
            jsonb_build_object('abgelehnt', 'ZAHLUNGEN_VORHANDEN', 'regulaere_zahlungen', regulaer, 'bezahlt', inv.paid_amount));
    RETURN jsonb_build_object('ok', false, 'code', 'ZAHLUNGEN_VORHANDEN');
  END IF;
  IF abs(COALESCE(inv.paid_amount, 0) - manuell) > 0.01 THEN                 -- bezahlter Betrag nicht durch manuelle Zahlungszeilen erklärt: nichts verlieren
    INSERT INTO abrechnung_historie (aktion, invoice_id, invoice_number, project_id, user_id, grund, details)
    VALUES ('status_geaendert', inv.id, inv.invoice_number, inv.project_id, p_user, 'Zurücksetzen auf offen abgelehnt',
            jsonb_build_object('abgelehnt', 'ZAHLUNG_ABWEICHUNG', 'bezahlt', inv.paid_amount, 'summe_zahlungszeilen', manuell));
    RETURN jsonb_build_object('ok', false, 'code', 'ZAHLUNG_ABWEICHUNG', 'paid_amount', inv.paid_amount, 'summe_zahlungen', manuell);
  END IF;
  IF inv.status = 'offen' AND COALESCE(inv.paid_amount, 0) = 0 AND manuell = 0 THEN RETURN jsonb_build_object('ok', true, 'status', 'offen', 'gebucht', 0); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'amount', amount, 'payment_date', payment_date)), '[]'::jsonb) INTO entfernt
    FROM invoice_payments WHERE invoice_id = inv.id AND quelle = 'manuell_bezahlt';
  DELETE FROM invoice_payments WHERE invoice_id = inv.id AND quelle = 'manuell_bezahlt';
  UPDATE invoices SET paid_amount = 0, status = 'offen', updated_at = now() WHERE id = inv.id;
  INSERT INTO abrechnung_historie (aktion, invoice_id, invoice_number, project_id, user_id, grund, details)
  VALUES ('status_geaendert', inv.id, inv.invoice_number, inv.project_id, p_user, COALESCE(p_grund, 'Manuell auf offen gesetzt'),
          jsonb_build_object('status', jsonb_build_object('von', inv.status, 'auf', 'offen'),
                             'bezahlt', jsonb_build_object('von', inv.paid_amount, 'auf', 0), 'zurueckgenommen', manuell, 'zahlungen', entfernt));
  RETURN jsonb_build_object('ok', true, 'status', 'offen', 'zurueckgenommen', manuell);
END; $$ LANGUAGE plpgsql;

-- ─── 3. Rechte der älteren Buchungsfunktionen ───
-- Nur service_role (alle Aufrufe laufen serverseitig mit dem Service-Schlüssel). Keine Funktion wird gelöscht oder verändert.
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('create_invoice', 'create_invoice_as_new_version', 'next_invoice_number') AND p.prokind = 'f' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
  END LOOP;
  EXECUTE 'REVOKE ALL ON TABLE public.faktura_migration_protokoll FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON TABLE public.faktura_migration_protokoll FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE public.faktura_migration_protokoll FROM authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE 'GRANT ALL ON TABLE public.faktura_migration_protokoll TO service_role'; EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.faktura_migration_protokoll_id_seq TO service_role'; END IF;
END $$;

-- Kontrolle: Altbestand der Schlüssel (Zustand nach der Migration) und Rechte
SELECT status, coalesce(herkunft, 'neu') AS herkunft, count(*) AS anzahl, count(invoice_id) AS mit_anker FROM faktura_idempotenz GROUP BY 1, 2 ORDER BY 1, 2;
SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('create_invoice', 'create_invoice_as_new_version', 'next_invoice_number') ORDER BY 1;

COMMIT;
