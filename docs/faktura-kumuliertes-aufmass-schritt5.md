# Kumuliertes Aufmaß – Schritt 5: Vorhaltung in Mengen statt Prozent

## Befund (vorher)
Der Teilabbau wurde nur als „verbleibender Anteil in %" erfasst. Der Gerüstbau denkt in Mengen (1.000 m² aufgebaut, 300 m² Teilabbau, 700 m² Restvorhaltung). Prozent ließ sich nicht nachvollziehbar auf eine Menge zurückführen, und auf der Rechnung stand nur „60 % Restbestand".

## Umsetzung
- Vereinbarung: optionale Menge des vollständigen Gerüsts (`bezugM2`, in m²). Vorschlag aus dem letzten Zwischenaufmaß bzw. der Kalkulationsfläche per Knopfdruck, nie still übernommen.
- Teilabbau: Restmenge in m² (`verbleibendM2`) ist führend; der Prozentsatz wird daraus abgeleitet und treibt wie bisher die Preisberechnung (anteilig oder voller Preis). Preislogik, Intervalle, Abrechnungsfenster und Datenbank bleiben unverändert (kein SQL).
- Rechnungstext: „… bei 700 m² von 1.000 m² (70 %) Restbestand". Ohne Bezugsmenge unverändert wie bisher.
- Anzeige im Block: „Gerüst gesamt 1.000 m²", „300 m² abgebaut, 700 m² bleiben stehen (70 %)".
- Altdaten nur mit Prozent bleiben gültig; beim Eintragen einer Gesamtmenge werden Prozentwerte in Mengen umgerechnet.
- Sicherheit: Eine ungültige Menge (über der Gesamtmenge, negativ, oder ohne Gesamtmenge) wird verworfen, nie still als 0 % gewertet. Nach der ersten Abrechnung können Restmenge oder Gesamtmenge nicht mehr so geändert werden, dass berechnete Zeiträume betroffen wären (bestehender Schutz, jetzt auch für Mengen geprüft).

## Bewusst nicht enthalten
- Keine automatische Verknüpfung der Restmenge mit dem Aufmaß (das Gerüst kann stehen bleiben, auch wenn das Aufmaß wächst); der Vorschlag ist nur eine Eingabehilfe.
- Keine Pflicht, dass die Restmenge von Teilabbau zu Teilabbau sinkt (ein Wiederaufbau wäre vertraglich denkbar).
- Prozent wird auf zwei Nachkommastellen gerundet (Preisabweichung bei krummen Mengen höchstens wenige Cent je Intervall).
