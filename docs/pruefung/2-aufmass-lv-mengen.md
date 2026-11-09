# Prüfung 2: Aufmaß, Leistungsverzeichnis und Mengen

Methode: automatische Tests, überwiegend als Zufallstests (hunderte Eingaben je Regel, wiederholbar), gegen die echten Rechenfunktionen.

## Geprüfte Regeln (alle bestanden)
- **Gerüstpositionen aus dem Aufmaß:** Die Summe der Rechnungspositionen ist immer der Angebotspreis (±1 Cent), bei beliebigen Abschnitten, mit und ohne Festpreis je m² (500 Fälle).
- **Abrechnung nach m²:** Fläche × (Grundpreis + Aufpreise); ungültige Werte zählen 0.
- **LV → Rechnung:** Jede gültige Position wird übernommen, der Rest steht in „übersprungen“; die Abweichung zur LV-Summe entsteht nur durch Cent-Rundung des Einzelpreises (300 Fälle).
- **LV von Hand ändern:** Neu rechnen ist wiederholbar (idempotent), entfallene Positionen = 0, Titel-/Gesamtsummen und 19 % MwSt stimmen (200 Fälle).
- **LV erzeugen:** Für alle vier Stile über viele Gebäudegrößen und Eingaben sind alle Zahlen endlich, Gesamtpreis = Menge × EP × Faktor, Summen stimmen, Positionsnummern eindeutig, MwSt nach Satz; Vorhaltung erst über der Grundstandzeit; GAEB-Export enthält jede Position genau einmal.
- **Zwischenaufmaß:** Jede Fläche wird genau einmal abgerechnet (Summe der abgerechneten Mengen = letzte abgerechnete kumulierte Fläche); gleiche oder kleinere kumulierte Fläche und doppeltes Abrechnen werden abgelehnt (200 Fälle).
- **Mengenermittlung (Kalkulationskern):** Mengen sind endlich, ganz, nicht negativ; Zeilenpreis = Menge × Einzelpreis; Gewicht = Zeilensumme; keine doppelte Artikelnummer; mehr Länge/Höhe braucht nie weniger Fläche/Gewicht; ein Abschnitt = dieselbe Rechnung wie ohne Abschnitte; zwei Abschnitte = Summe der einzelnen (200 + 100 Fälle).
- **Liefermengen:** Kein Bauteil der echten Materialliste wird in zwei Lieferfeldern doppelt gezählt.

## Gefundene und behobene Fehler
1. **Preis je m² im deutschen Format:** „1.500,50“ wurde als 1,5 gelesen (`parseFloat` bricht am zweiten Punkt ab). Der Preis wäre ohne Fehlermeldung viel zu niedrig gespeichert worden. Behoben, unlesbarer Text bleibt ein Fehler.
2. **Rechnungspositionen im deutschen Format:** In der Rechnungsposition (Menge, Preis, Maße) wurde „1.500,50“ zu 0. Behoben.

3. **MwSt bei Neuberechnung von Hand:** `rechneLvNeu` rechnete immer mit 19 %, auch wenn das LV mit einem anderen Satz erzeugt wurde. Jetzt gilt der Satz des LV (sonst 19 %).

Die ersten beiden Stellen nutzen jetzt dieselbe Regel (`lib/zahl-eingabe.ts`, auch für die Schlussrechnung): mit Komma deutsches Format (Punkt = Tausender), ohne Komma ist der Punkt das Dezimalzeichen.

## Offene Punkte (Entscheidung nötig, nicht geändert)
- **„1.500“ ohne Komma** wird als 1,5 gelesen (Punkt = Dezimalzeichen). Das ist bei Eingabefeldern mehrdeutig; wer Tausender eintippt, sollte „1500“ schreiben. Falls ihr eine Warnung im Formular wollt, sagt Bescheid.
- **Nicht geprüft:** Geometrie-Erkennung aus Punktwolken, IFC- und CAD-Import, KI-Mengenvorschläge (liefern Schätzwerte, keine feste Regel), Aufmaß-PDF-Layout.
