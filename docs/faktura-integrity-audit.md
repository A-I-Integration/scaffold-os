# Faktura Integrity Audit – Befund vor den Änderungen

Ausgangsstand: Commit `dfeb2e0` (Branch `faktura-hardening`). Dieser Befund wurde VOR den Änderungen geschrieben.

## 1. Verbliebene Eigenberechnungen offener Beträge

| Stelle | Formel | Wirkung | Behandlung |
|---|---|---|---|
| `lib/mahnung-steuerung.ts` `offenerBetrag` | brutto − paid_amount | nur noch Fallback in `invoice-pdf.ts`, ignoriert Gutschriften | entfernen |
| `lib/invoice-pdf.ts` Mahnung / Erinnerung | `offen_zentral ?? brutto − paid` | falscher Betrag, wenn `offen_zentral` fehlt | Fallback entfernen, `offen_zentral` Pflicht (ohne Wert wird kein PDF erzeugt) |
| `lib/faktura-kennzahlen.ts` `offenerBetrag` | brutto − paid_amount | Fallback `?? offenerBetrag(r)` in Kennzahlen, Offene Posten, Übersicht | entfernen, nur `berechneForderung` |
| `lib/faktura-kennzahlen.ts` `anzeigeStatus` / `istUeberfaellig` | gespeicherter Status + paid_amount | Status-Filter zeigt durch Gutschrift ausgeglichene Rechnung als „offen“/„überfällig“ | auf `forderungsStatus` (zentral) umstellen |
| `app/api/import/rechnungen/route.ts` `summeOffen` | brutto − bezahlt je Importzeile | nur Vorschau-Summe beim CSV-Import, Gutschrift-Bezug zur Importzeit nicht auflösbar | bleibt, dokumentiert und per Test abgesichert (keine Anzeige einer Forderung) |
| `lib/abrechnung-pruefung.ts` `ZAHLUNG_UEBER_BETRAG` | paid_amount > brutto | Plausibilitätsprüfung, kein offener Betrag | bleibt (keine Forderungsberechnung) |
| `lib/schlussrechnung.ts` `paidRaw` | bezahlt je Abschlag | Anrechnung bereits bezahlter Abschläge, kein offener Betrag | bleibt (fachlich eigenständig) |
| `lib/forderung.ts` | zentrale Quelle | – | bleibt einzige Quelle |

Cron `app/api/cron/mahnwesen/route.ts` und `lib/mahnung-versand.ts` verwenden bereits den zentralen offenen Betrag (`nichtsOffen`).

## 2. Datenlimit

`GET /api/invoices` liest mit `limit=3000`. Supabase/PostgREST begrenzt zusätzlich je Anfrage (Standard 1000 Zeilen, siehe Kommentar im Mahn-Cron). Folge: Ältere Rechnungen und deren Gutschriften fehlen in der geladenen Liste, die Oberflächen rechnen mit einer unvollständigen Liste.
Lösung: serverseitig seitenweise lesen (stabile Sortierung, Duplikate entfernen), Obergrenze 20 000; Gutschriften zu den gelieferten Rechnungsnummern werden gezielt per `reference_invoice_number` nachgeladen und ergänzt (unabhängig von Seite/Limit); wird die Obergrenze erreicht, meldet die Antwort `abgeschnitten: true` und die Oberflächen zeigen den Ladefehler statt eines Betrags.

## 3. Gespeicherter vs. abgeleiteter Status

Gespeichert bleibt `offen` bei reinem Gutschriftausgleich (Datenmodell-Entscheidung, CHECK-Constraint). Fachliche Auswertungen müssen den abgeleiteten Status nutzen: Mahnwesen (ok, prüft offenen Betrag), Kennzahlen (zählen nur offen > 0, ok), Offene Posten (ok), Status-Filter in der Faktura-Übersicht (Mangel, siehe oben), Rechnungsliste/Zahlungsabgleich (offen > 0 geprüft). Der Mahn-Cron filtert im Datenbankfilter auf Status `offen/ueberfaellig` und prüft danach den zentralen Betrag.

## 4. Transaktionssicherheit (Ist)

- Zahlung buchen: Lesen → Berechnen → bedingtes UPDATE (`paid_amount` unverändert) → INSERT Zahlung (mit manueller Rücksetzung bei Fehler) → Nachprüfung. Mehrere HTTP-Aufrufe, keine Transaktion. Fenster: Absturz zwischen UPDATE und INSERT hinterlässt `paid_amount` ohne Zahlungszeile; Rücksetzen ist best effort.
- Zahlung löschen: DELETE und UPDATE getrennt, ohne Bedingung.
- Gutschrift anlegen/stornieren/löschen: Beleg und Statusabgleich getrennt.
- Doppelte Requests / Wiederholung nach Netzwerkfehler: nicht erkannt → Doppelbuchung möglich (zwei gleiche Zahlungen werden nur durch die Obergrenze „offen“ gebremst).
- Konkurrierende Zahlung ‖ Gutschrift: Beträge bleiben richtig (Gutschrift wird auf offen begrenzt, Rest = Guthaben), nur der gespeicherte Status konvergiert über Nachprüfung. Keine Atomarität.

Lösung (SQL-Phase 129): Datenbankfunktionen mit Zeilensperre auf der Rechnung (`FOR UPDATE`) für Zahlung buchen und Zahlung löschen; Trigger auf Gutschriften sperrt dieselbe Rechnungszeile und gleicht den Status in derselben Transaktion ab; Idempotenzschlüssel für Zahlungen (eindeutig je Schlüssel, Wiederholung liefert das ursprüngliche Ergebnis) und für das Anlegen von Gutschriften. Die SQL-Berechnung ist ein dokumentiertes Spiegelbild von `lib/forderung.ts` und wird per Paritätstest gegen die TypeScript-Berechnung abgesichert.

## 5. Umsetzung (Stand dieser Runde)

- Eigenberechnungen: `mahnung-steuerung.offenerBetrag` entfernt; Mahn-PDFs verlangen `offen_zentral` (sonst Fehler statt falschem Betrag); `faktura-kennzahlen` ohne eigene Formel, Status-Filter über `statusJe` (ausgeglichen = bezahlt-Gruppe, nie offen/überfällig). Wächtertest deckt `lib/`, `app/api/` und Cron ab; Ausnahmen sind im Test dokumentiert.
- Datenlimit: `ladeAlleRechnungen` (seitenweise, Obergrenze 20 000 → Fehler statt Abschneiden, Gutschriften zu gelieferten Rechnungen unabhängig vom Filter).
- Atomarität: SQL-Phase 129 (`faktura_zahlung_buchen`, `faktura_zahlung_loeschen`, Gutschrift-Trigger, `faktura_idempotenz_*`); Idempotency-Key in Zahlungs- und Rechnungs-/Gutschrift-Anlage; Client behält den Schlüssel bis zum sicheren Abschluss.
- Nicht verändert: manuelles „Als bezahlt“ (PATCH /api/invoices) bleibt der bisherige Pfad (bedingtes UPDATE auf den gelesenen Stand, zentrale Obergrenze) – nicht Teil der Datenbankfunktion.
