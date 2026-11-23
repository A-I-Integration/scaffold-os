# Faktura Phase 130 – Befund vor den Änderungen

Ausgangsstand: Commit `92642cc`, SQL-Phase 129. Dieser Befund wurde VOR den Änderungen geschrieben.

## 1. Idempotenz (`faktura_idempotenz_*`, `lib/idempotenz-client.ts`, `POST /api/invoices`)

Aufrufkette Rechnung/Gutschrift anlegen: Browser `fetchRechnungAnlegen` → `fetchMitSchluessel` (Header `Idempotency-Key`) → `POST /api/invoices` (Wrapper) → `faktura_idempotenz_start` → `anlegen()` → (Reservierungen Aufmaß/Vorhaltung) → RPC `create_invoice` / `create_invoice_as_new_version` / `rechnung_anlegen_zugeordnet` → Nachfolgeschritte (Kopfdaten, Verlauf, Freigabe, Statusabgleich) → `faktura_idempotenz_ende`.

| Nr. | Befund | Folge |
|---|---|---|
| 1.1 | `faktura_idempotenz_start` übernimmt einen Schlüssel im Zustand `laeuft` nach 2 Minuten allein anhand des Zeitstempels (`aktualisiert_am`). | Lief der erste Vorgang noch (oder wurde er nur langsam abgeschlossen), führt ein zweiter Request mit demselben Schlüssel die Anlage erneut aus. Rechnung/Gutschrift werden doppelt angelegt. Bei Zahlungen verhindert das der Unique-Index auf `invoice_payments.request_key`, bei Rechnungen gibt es keinen eindeutigen Anker. |
| 1.2 | `faktura_idempotenz_ende` löscht den Schlüssel bei jedem Nicht-2xx-Ergebnis. | Endet die Route nach dem Commit der Rechnung mit einem Fehler (z. B. Nachfolgeschritt wirft), verschwindet der Schlüssel; die Wiederholung legt eine zweite Rechnung an. |
| 1.3 | Es wird kein Hash der Nutzdaten gespeichert. | Derselbe Schlüssel mit anderem Inhalt liefert still die alte Antwort (oder legt neu an). Ein Schlüsselkonflikt wird nicht erkannt. Bei Zahlungen wird nur die Rechnung, nicht Betrag/Datum verglichen. |
| 1.4 | Schlüssel und Rechnung werden nicht atomar festgeschrieben (Schlüsselzeile in eigener Transaktion, Rechnung im RPC, Antwort im dritten Schritt). | Ein Absturz nach dem Commit der Rechnung hinterlässt einen Schlüssel `laeuft`, der nicht von „nie gelaufen“ unterscheidbar ist. |
| 1.5 | Keine Bereinigung: `faktura_idempotenz` wächst unbegrenzt. | Eine Löschfunktion fehlt; eine naive Löschung nach Alter könnte laufende Vorgänge treffen. |

Lösung (Phase 130): Der Schlüssel wird mit der Rechnung in EINER Transaktion festgeschrieben (Funktion `faktura_anlegen_idempotent`, Advisory-Lock je Schlüssel, ruft die vorhandenen Anlegefunktionen auf). Damit ist „angelegt“ ein dauerhafter Anker, kein Zeitstempel. Ein Schlüssel ohne Anker kann gefahrlos erneut ausgeführt werden (der Anker verhindert die zweite Rechnung auch bei Überschneidung); ein Schlüssel mit Anker gibt immer das ursprüngliche Ergebnis zurück. Nutzdaten-Hash, Konflikterkennung, Zustände `laeuft → angelegt → fertig`, Bereinigung nur abgeschlossener/leerer Alteinträge.

## 2. Manuelles „Als bezahlt“ (`PATCH /api/invoices`)

Aufrufer: Rechnungsliste, Rechnungsakte, Kundenakte, Kundenliste, Auftragsbereich, Zahlungsabgleich (Volltreffer). Sie senden `status` (bezahlt/offen) teils mit `paid_amount` (Brutto oder 0).

| Nr. | Befund |
|---|---|
| 2.1 | `paid_amount` und Status werden direkt auf der Rechnung gesetzt, OHNE Zahlungszeile in `invoice_payments`. Ergebnis: Zahlungshistorie und `paid_amount` laufen auseinander. |
| 2.2 | Die Berechnung des Rests passiert in TypeScript, danach folgt ein getrenntes UPDATE ohne Sperre. Gleichzeitige Zahlung und Statuswechsel sind nicht serialisiert (nur `status=neq.storniert` als Bedingung). |
| 2.3 | „Zurück auf offen“ setzt `paid_amount` auf 0, obwohl Zahlungszeilen existieren können: gebuchte Zahlungen bleiben, `paid_amount` nicht. |
| 2.4 | Verlauf: `userId` wird protokolliert, ein Grund nicht. |

Entscheidung: Eine rein manuelle Statusänderung ohne Buchung ist fachlich nicht nötig. „Als bezahlt“ bleibt als Knopf, wird aber zur Buchung des noch offenen Restbetrags (nach Gutschriften) als echte Zahlung mit Vermerk, in einer Datenbankfunktion unter Zeilensperre. Ist nichts offen (Gutschrift hat ausgeglichen), wird KEINE Zahlung fingiert. Stornierte Rechnungen: 409. „Zurück auf offen“ nimmt nur Zahlungen zurück, die durch „Als bezahlt“ entstanden sind; andere Zahlungen bleiben (409, Zahlung gezielt korrigieren). Standalone-`paid_amount` per PATCH wird abgelehnt.

## 3. Migration 129 (vollständige Datei geprüft)

| Nr. | Befund | Behandlung |
|---|---|---|
| 3.1 | Neue Funktionen sind für `PUBLIC` ausführbar (Standard). In Supabase sind sie damit über `/rest/v1/rpc/...` für `anon`/`authenticated` aufrufbar. Auf `invoices` gilt bereits `invoices_authenticated_all` (alle angemeldeten Nutzer, `USING (true)`), die Rollenprüfung (admin/disponent) der Routen ließe sich per direktem RPC-Aufruf umgehen. | Phase 130: `REVOKE ... FROM PUBLIC, anon, authenticated`, `GRANT ... TO service_role` für alle `faktura_*`-Funktionen; Tabelle `faktura_idempotenz`: alle Rechte für `anon`/`authenticated` entzogen (RLS ist aktiv, keine Policy). Das Verhalten der älteren Funktionen (Phase 93/94/126–128) wird NICHT geändert (ungeprüft, nicht Teil dieser Runde), aber als Risiko gemeldet. |
| 3.2 | Fremdschlüssel/Unique: `request_key` partiell eindeutig; `faktura_idempotenz` ohne Fremdschlüssel auf `invoices` (Anker `invoice_id` ohne FK, damit eine Bereinigung/ein Löschen der Rechnung den Schlüssel nicht blockiert). | Anker ohne FK dokumentiert. |
| 3.3 | Ausführung mit den Supabase-Rollen: Funktionen sind SECURITY INVOKER und laufen mit dem aufrufenden `service_role` (umgeht RLS). Trigger laufen mit der Rolle des auslösenden Statements. | im Test mit Rollen geprüft. |
| 3.4 | Wiederholbarkeit: `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`. Teilausfall: Phase 129 ist nicht in einer Transaktion gekapselt. | Phase 130 läuft in `BEGIN … COMMIT`; Test mit zweimaliger Ausführung. |
| 3.5 | Abhängigkeiten: 129 braucht `invoice_payments` (38) und `abrechnung_historie` (125). Phase 126–128 werden zur Laufzeit von `faktura_anlegen_idempotent` (Phase 130) verwendet (`rechnung_anlegen_zugeordnet`, 128; `create_invoice`, 93; `create_invoice_as_new_version`, 94). | in der Migration dokumentiert. |
| 3.6 | Trigger: INSERT, UPDATE, DELETE nur für `invoice_type = 'gutschrift'`; der Abgleich ändert nur den Status der Bezugsrechnung, nie Zahlungen oder Beträge. Der Verlaufseintrag aus dem Trigger hat keinen Benutzer (die Datenbank kennt ihn nicht). | dokumentiert (Risiko). |
| 3.7 | Historische Buchungen: Phase 129 schreibt in `invoice_payments` nur die neue Spalte `request_key` (NULL). Keine bestehende Zeile wird verändert. | bestätigt, Test über Prüfsumme. |
