# Faktura Phase 130 – Final Security Review: Befund vor den Änderungen

Ausgangsstand: Commit `36d8567`. Geprüft wurden die Migrationen 93, 94, 126–130, `kunden-schema.sql`, die Routen und die lokale PostgreSQL (Rechte per `has_function_privilege`, Richtlinien per `pg_policies`). Dieser Befund wurde VOR den Änderungen geschrieben.

**Korrektur zum letzten Bericht:** Dort stand, die Funktionen aus 93, 94 und 126–128 seien „weiterhin für PUBLIC ausführbar“. Das stimmt nur für 93/94 und `next_invoice_number`. Die Phasen 126, 127 und 128 entziehen `PUBLIC`, `anon` und `authenticated` bereits per `REVOKE` und vergeben `EXECUTE` nur an `service_role` (Beleg unten). Diese Aussage war zu pauschal und wird hiermit berichtigt.

## 1. Alte Idempotenzdatensätze (aus Phase 129)

Aufrufkette: `POST /api/invoices` → `faktura_idempotenz_start` → `anlegen()` → `faktura_idempotenz_ende`. In Phase 129 gab es als Art nur `rechnung_anlegen`; Zahlungen nutzen `invoice_payments.request_key`, nicht diese Tabelle.

| Nr. | Befund | Folge |
|---|---|---|
| 1.1 | Phase 129 kannte nur `laeuft`/`fertig`, keine Spalten `nutzdaten_hash`, `invoice_id`, `lease_bis`. Nach Phase 130 stehen Altzeilen mit `nutzdaten_hash IS NULL`. | Der Konfliktvergleich (`z.nutzdaten_hash IS NOT NULL AND p_hash IS NOT NULL AND …`) greift bei Altzeilen nie: derselbe Schlüssel mit ANDEREN Nutzdaten bekäme die alte Antwort zurück. Bestätigt. |
| 1.2 | Altzeile `fertig` ohne Anker: Die gespeicherte Antwort enthält die Rechnung (`antwort.invoice.id`), der Anker `invoice_id` fehlt aber. | Der Anker ist ableitbar (Rechnung existiert) und sollte nachgetragen werden. Für beliebige neue Nutzdaten darf die Antwort NICHT ausgeliefert werden. |
| 1.3 | Altzeile `laeuft` ohne Anker: Phase 129 konnte „nie gelaufen“ nicht von „Rechnung committet, Absturz vor `ende`“ unterscheiden. | Automatische Wiederaufnahme (Phase 130: Zustand `wiederaufnahme`) könnte eine Rechnung DOPPELT anlegen. Hier gibt es keinen Beleg für „nichts angelegt“. |
| 1.4 | Die Bereinigung (Phase 130) löscht `laeuft` ohne Anker nach 7 Tagen und `fertig` nach 90 Tagen, auch bei Altzeilen. | Altzeilen würden ohne Prüfung gelöscht. Das widerspricht „nicht ungeprüft löschen“. |
| 1.5 | Die Route berechnet den Hash; schlägt das fehl, wird `NULL` übergeben und der Schutz entfällt still. | Ein fehlender Hash darf nicht zu einem Schlüssel ohne Konfliktprüfung führen. |

Entscheidung (Phase 131): Altzeilen werden markiert (`herkunft = 'phase129'`), der Anker wird aus der Antwort nachgetragen, wenn die Rechnung existiert; die Migration protokolliert Anzahl und Umfang in einer eigenen Protokolltabelle. Altzeilen werden NIE als Wiederholung für beliebige neue Nutzdaten akzeptiert: `fertig` → Antwort 409 `ALTER_SCHLUESSEL` mit der vorhandenen Rechnungsnummer (nichts wird neu angelegt), `laeuft` → 409 `ALTER_SCHLUESSEL_UNKLAR` (manuell prüfen). Die Bereinigung löscht Altzeilen nur, wenn sie `fertig` sind, einen geprüften Anker auf eine vorhandene Rechnung haben und älter als die Frist sind; ungeklärte Altzeilen bleiben stehen. Fehlender Hash → 400.

## 2. `faktura_status_setzen` – „Zurück auf offen“

Aufrufkette: UI → `PATCH /api/invoices` (`status: 'offen'`) → `rpc/faktura_status_setzen(p_ziel='offen')`.

| Nr. | Befund | Folge |
|---|---|---|
| 2.1 | Nach dem Löschen der manuellen Zahlungszeilen wird `paid_amount` unbedingt auf 0 gesetzt. | Historische Rechnungen mit `paid_amount > 0` OHNE Zahlungszeilen (die alte `PATCH`-Buchung von vor Phase 130 schrieb nur den Betrag) verlieren ihren Stand ohne Erklärung. Bestätigt. |
| 2.2 | Die Funktion prüft nicht, ob `paid_amount` zur Summe der Zahlungszeilen passt. | Abweichungen werden nicht erkannt. |
| 2.3 | Gemischte Zahlungszeilen (manuell + regulär): die Funktion bricht korrekt mit `ZAHLUNGEN_VORHANDEN` ab, löscht und ändert nichts. | in Ordnung, aber nicht getestet. |
| 2.4 | Eine Ablehnung hinterlässt keinen Verlaufseintrag. | Versuche sind nicht nachvollziehbar. |

Entscheidung: Vor jeder Änderung Summe der manuellen Zeilen mit `paid_amount` abgleichen. Nur wenn `paid_amount` = Summe der manuellen Zeilen (±0,01) wird zurückgenommen; sonst Abbruch mit `ZAHLUNG_ABWEICHUNG` und verständlichem Text, nichts wird verändert. Reguläre Zahlungen werden nie gelöscht oder verändert (unverändert, jetzt getestet). Jede Rücknahme und jede Ablehnung wird im Verlauf protokolliert (Benutzer, Grund, Beträge, Zahlungs-IDs).

## 3. Rechte der älteren Funktionen (Phasen 93, 94, 126–128)

Gemessen auf der lokalen Datenbank (alle Migrationen angewendet):

| Funktion | Ändert | PUBLIC/anon/authenticated | service_role | über API erreichbar | umgeht neue Buchungsregeln |
|---|---|---|---|---|---|
| `create_invoice` (93) | legt Rechnung an (Nummer, Zeile) | **ausführbar** (kein REVOKE) | ja | `/rest/v1/rpc/create_invoice` für jeden angemeldeten Nutzer (INVOKER, Tabellenrecht + RLS) | Ja: legt Rechnungen an, an Idempotenz und Reservierungen vorbei |
| `create_invoice_as_new_version` (94) | storniert Alt-Rechnung und legt neue an | **ausführbar** | ja | wie oben | Ja: storniert Rechnungen, an Gutschriftsprüfung und Zuordnungsfreigabe vorbei |
| `next_invoice_number` (kunden-schema) | zählt Nummernkreis hoch | **ausführbar** | ja | wie oben | verbraucht Rechnungsnummern (Lücken im Nummernkreis, GoBD-relevant) |
| `aufmass_zuordnen` (126/128) | Aufmaß-Zuordnung in `projects.data` | gesperrt (REVOKE) | ja | nein | nein |
| `vorhaltung_zuordnen` (127/128) | Vorhaltezeitraum-Zuordnung | gesperrt | ja | nein | nein |
| `rechnung_anlegen_zugeordnet` (128) | Rechnung + Zuordnung | gesperrt | ja | nein | nein |
| `faktura_*` (129/130) | Buchungen, Status, Idempotenz | gesperrt (Phase 130) | ja | nein | nein |

- Alle fünf älteren Funktionen sind `SECURITY INVOKER` (`prosecdef = false`); ein `search_path`-Problem durch DEFINER besteht dort nicht. Die zwei DEFINER-Triggerfunktionen aus Phase 130 setzen `search_path = public, pg_temp`.
- Aufrufer im Code: `create_invoice`, `create_invoice_as_new_version`, `next_invoice_number` werden ausschließlich serverseitig mit dem `SUPABASE_SERVICE_ROLE_KEY` aufgerufen (`app/api/invoices/route.ts`, `app/api/cron/standzeit-abrechnung/route.ts`, `app/api/onboarding/demo/route.ts`). Kein Browser-Aufruf. Ein Entzug von `PUBLIC/anon/authenticated` bricht daher keinen bekannten Aufruf.
- **RLS auf Tabellenebene (nicht Teil dieser Korrektur, aber relevant):** `phase-13` legt `invoices_authenticated_all` (`FOR ALL TO authenticated USING (true) WITH CHECK (true)`) an; dazu kommt die einschränkende Policy `no_statiker`. Jeder angemeldete Nutzer außer Statiker kann `invoices`, `invoice_payments`, `abrechnung_historie` bei vorhandenen Tabellenrechten DIREKT über die REST-Schnittstelle schreiben und damit alle Funktionsregeln umgehen. Im Code gibt es keinen Browser-Zugriff auf diese Tabellen (`.from('invoices')` kommt in `app/`, `components/`, `lib/` nicht vor). Eine Änderung der Policies wäre aber ein Eingriff in produktive Richtlinien, die ich hier nur aus den Migrationen kenne (die lokale Datenbank weicht ab: dort fehlt `invoices_authenticated_all`). Daher: nur dokumentiert, nicht geändert. Empfehlung: Policies der echten Test-Supabase auslesen und gesondert entscheiden.
- **Provisionierung:** `supabase/kunden-schema.sql` (Quelle für `lib/provision/kunden-schema.ts`) enthält keine einzige der Funktionen aus 126–130. Neue Kundeninstanzen aus diesem Schema haben sie nicht; die Routen antworten dann mit 503 `…MIGRATION_FEHLT` statt falsch zu buchen. Nicht geändert (unbeteiligte Datei), als Risiko gemeldet.

Entscheidung: Phase 131 entzieht `PUBLIC`, `anon`, `authenticated` bei `create_invoice`, `create_invoice_as_new_version`, `next_invoice_number` und vergibt `EXECUTE` nur an `service_role` (mit Existenzprüfung der Rollen, mehrfach ausführbar). Keine Funktion wird gelöscht oder geändert.

## 4. Abhängigkeiten und Migrationsreihenfolge

Phase 131 braucht 93, 94, 125, 128, 129 und 130. Läuft in `BEGIN … COMMIT`. Mehrfach ausführbar; die Altbestands-Markierung und der Anker-Nachtrag sind idempotent (nur Zeilen mit `herkunft IS NULL` bzw. `invoice_id IS NULL`). Bestehende Buchungen (`invoices`, `invoice_payments`, `abrechnung_historie`) werden nicht verändert; das prüft ein Test per Prüfsumme.
