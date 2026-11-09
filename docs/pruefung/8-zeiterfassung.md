# Prüfung 8 – Zeiterfassung

## Gefunden und behoben
1. **Keine Prüfung der Zahlen:** Beim Stempeln, Nachtragen und Korrigieren wurden Stunden, Pausen, Spesen und Fahrzeiten ungeprüft gespeichert (negativ, 900 Stunden, Text). Das floss in Monatssummen und Lohnbasis. Jetzt gilt: Stunden 0–24, Pause 0–600 min, Spesen 0–10.000 €, Fahrzeit 0–1.440 min, Datum im Format JJJJ-MM-TT. Zahlen im deutschen Format ("7,5") werden gelesen.
2. **Monatsübersicht las höchstens 1000 Zeilen:** Bei vielen Mitarbeitern (z. B. 60 × 20 Tage) fehlten die späteren Tage und die Summen waren still zu klein. Die Ansichten (Monat und Baustelle) lesen jetzt seitenweise alle Zeilen.

## Geprüft, ohne Befund
- Pausenregel (30 min ab 6 h, 45 min ab 9 h), Netto-Rechnung, Schicht über Mitternacht, Ende vor Start wird abgewiesen.
- Rechte: Bauleiter dürfen lesen, aber nicht nachtragen; Mitarbeiter sehen nur eigene Zeiten (aus Prüfung 4).

## Entschieden und umgesetzt
- **Eigene Zeiten:** Nur Admin und Disposition dürfen Zeiten nachtragen oder ändern. Alle anderen (Mitarbeiter, Lager, Bauleiter) können nur einstempeln und ausstempeln; die Endzeit setzt der Server, ein bereits abgeschlossener Eintrag lässt sich nicht mehr ändern.
- **Pausenregel nach Gesetz:** 30 min bei mehr als 6 h, 45 min bei mehr als 9 h brutto (genau 6:00 bzw. 9:00 h lösen die Stufe noch nicht aus).
- **Doppeltes Einstempeln:** Keine Sperre. Wer vergessen hat auszustempeln, stempelt aus und neu ein; das Büro korrigiert bei Bedarf.

## Offen
- Feiertage werden bei den Arbeitstagen nicht abgezogen (bekannt).
