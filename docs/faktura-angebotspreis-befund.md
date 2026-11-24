# Befund: Angebotspreis folgt nicht der gewählten Preisbasis

Gefunden bei der Browserabnahme (24.11.): Im Projekt stand in Aufmaß Schritt 6 die Preisbasis „Festpreis je m²“ (10 €/m² × 1000 m² = 10.000 €),
die KI-Kalkulation im selben Projekt nannte 152.447 €.

## Was falsch war
| Stelle | Verhalten vorher | Folge |
|---|---|---|
| Öffentliche Angebotsseite (`/angebot/<Token>`, `app/api/public/angebot/route.ts`) | `endpreis = kiResult.suggestedPrice` | Kunde sah 152.447 € statt 10.000 € und konnte dieses Angebot annehmen |
| Kundenseite, Button „Rechnung aus Angebot erstellen“ (`erstelleRechnungAusAngebot`) | Basis = `kiResult.suggestedPrice` | Rechnung über 152.447 €; die Abweichungs-Sperre (Auftragswert 10.000 €) hielt sie auf |

Auftragsstand, Schlussrechnung und Schritt 6 rechnen bereits über `angebotNettoAusProjekt` / `berechneAngebotBetraege` (lib/schlussrechnung.ts, lib/auftragsstand.ts) und waren richtig.

## Änderung
- `lib/aufmass-rechnung.ts`: neue Funktion `angebotsRechnungPositionen(data, kranTagessatz)`: Gerüst-Hauptposition aus der gewählten Preisbasis (wie bisher aufgeschlüsselt nach Abschnitten) plus Kran, Fahrt, Miete, Nachtrag, Statik, Rabatt. Summe = `angebotNettoAusProjekt`.
- Öffentliche Angebotsseite und Button nutzen diese Berechnung. Der Kransatz der Firma geht in den Preis ein und wird nicht nach außen gegeben.
- Tests: `lib/__tests__/angebot-rechnung-preisbasis.test.ts` (6), `__tests__/pruefung/angebot-link.test.ts` (+5).

## Bewusst nicht geändert / offen
- Dashboard (`app/api/dashboard/stats/route.ts`): Umsatz fällt auf `kiResult.suggestedPrice` zurück, wenn `projects.total_value` leer ist. Ob und wann `total_value` gesetzt wird, ist nicht geprüft.
- Schritt 6 rechnet die Beträge in `calcAngebot` (Komponente) parallel zu `berechneAngebotBetraege`; ein Paritätstest dafür fehlt.
- Angebots-PDF und Angebots-Mail: nicht im Browser geprüft.
- Bereits versendete Angebote: der Link zeigt nach dem Update den korrigierten Preis; ein bereits angenommener Fall (Status „angenommen“ bei falschem Preis) muss fachlich geklärt werden.
