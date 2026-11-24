# Dashboard: Projektwert folgt der gewählten Preisbasis

## Befund
`app/api/dashboard/stats/route.ts` nahm als Projektwert `projects.total_value` oder sonst den KI-Preis (`kiResult.suggestedPrice`). Wird `total_value` nicht gepflegt, zeigte das Dashboard bei Festpreis oder Pauschale den KI-Preis (Beispiel Ahaus: 152.447 € statt 10.000 €). Gleicher Fehlertyp wie beim Angebotspreis.

## Umsetzung
- Wert = gespeicherter `total_value`, sonst Angebotswert laut gewählter Preisbasis (`angebotNettoAusProjekt`, derselbe Wert wie öffentliche Angebotsseite, Auftragsstand und Rechnung aus Angebot, inkl. Kran mit Firmensatz), zuletzt der KI-Preis.
- Bei Festpreis oder Pauschale ergeben sich Kosten und Marge aus den kalkulierten Kosten (nicht aus der KI-Marge): ein Festpreis unter den Kosten erscheint als Verlust statt als 25 % Marge.
- Bei KI-Kalkulation und ohne Preisbasis (ältere Projekte, CAD-Projekte) unverändert.

## Bekannt / nicht geändert
Die Marge der KI-Kalkulation wird weiter nach der bisherigen Formel (Umsatz × (1 − Marge/100)) geschätzt.
