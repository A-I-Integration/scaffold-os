# Tiefenprüfung 1: Geld und Rechnungen

Branch `pruefung-geld` (auf `main`). 4 neue Testdateien mit 67 Tests unter `__tests__/pruefung/`. Gesamtsuite: 1856 Tests grün.

## Gefundene Fehler und Behebung
| Nr. | Fund | Folge | Behebung | Test |
|---|---|---|---|---|
| 1 | Mahnung rechnete Verzugszinsen und Gesamtbetrag auf den **vollen** Rechnungsbetrag, auch nach Teilzahlung (die Zahlungserinnerung nutzte schon den offenen Betrag) | Kunde wird zu viel gemahnt | Beide nutzen `offenerBetrag()`; Mail zeigt „Offener Betrag“ | mahnwesen.test.ts |
| 2 | Mahnung konnte für eine Rechnung verschickt werden, deren Zahlungen den Betrag schon decken (Status noch „offen“) | Mahnung ohne Forderung | Versand wird mit Hinweis abgelehnt | mahnwesen.test.ts |
| 3 | Stripe-Webhook schluckte Datenbankfehler (Antwort 200) | Kauf bezahlt, aber Abo/Zugang nicht gespeichert, Stripe wiederholt nie | Fehler werden geworfen → 500 → Stripe wiederholt; ein nicht lesbarer Stand erzeugt keinen zweiten Kundenzugang | stripe-webhook.test.ts |
| 4 | Standzeit-Abrechnung: Wenn das Speichern des Merkers „abgerechnet bis“ scheiterte, wurde dieselbe Standzeit am Folgetag **erneut** berechnet | Doppelrechnung | Die gerade angelegte (nie versendete) Rechnung wird zurückgenommen und als Fehler gemeldet | standzeit-abrechnung.test.ts |
| 5 | Schlussrechnung las Beträge mit Komma falsch („1500,50“ → 1500; „1.500,50“ → 1,5) bei Nachtrag, Rabatt, Miete | falsche Summen, falls ein Wert nicht über ein Zahlenfeld kommt | `zahlAusEingabe()` | schlussrechnung-regeln.test.ts |

## Geprüft ohne Befund
Reihenfolge der Mahnstufen, keine Mahnung für Gutschrift/bezahlt/storniert, Pause, fehlende E-Mail, Mail-Fehler ohne Statusänderung, Cron nur mit Secret, Stripe-Signatur, Statuswechsel (Verzug, Kündigung → Sperre, Reaktivierung), Abschlagsabzug (§ 14 Abs. 5 UStG) mit Teilzahlung, Überzahlung, anderem Steuersatz, Rabatt, Kran, Aufmaß-Rundung.

## Offene Fragen und Grenzen
1. **Umsatzsteuer in der Standzeit-Abrechnung:** fest 19 %. Ob für deine Kunden die Steuerschuld-Umkehr (§ 13b UStG) gilt, ist eine steuerliche Entscheidung, nicht geprüft.
2. **Mahnung/Verzugszinsen:** Zinssatz und Pauschale kommen aus den Einstellungen; ob der Satz zum jeweiligen Kunden (B2B/B2C) passt, ist nicht geprüft.
3. **Cron lädt höchstens so viele offene Rechnungen, wie die Datenbankabfrage standardmäßig zurückgibt** (bei Supabase üblicherweise 1000). Bei sehr vielen offenen Rechnungen würden später nicht mehr gemahnt. Nicht getestet, nur aus dem Code erkannt.
4. Zwei gleichzeitige Mahnläufe (Cron und Knopf) könnten dieselbe Stufe doppelt versenden. Unwahrscheinlich, nicht behoben.
5. Nachträge, Angebotsannahme und Abrechnung nach m² habe ich in diesem Durchgang nicht tiefer geprüft.
