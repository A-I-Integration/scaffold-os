# Kumuliertes Aufmaß – Schritt 4: Schlussaufmaß als Differenz

## Befund (vorher)
Ein Zwischenaufmaß konnte nur mit einer Abschlagsrechnung abgerechnet werden (`AUFMASS_NUR_ABSCHLAG`). Die Schlussrechnung rechnete über Angebotspreis oder die Gesamtfläche des Aufmaßblatts und kannte die je Position kumulierten Mengen nicht.
Folge: Die Schlussrechnung konnte von den abgerechneten Zwischenaufmaßen abweichen (Unter- oder Überberechnung), ohne dass der Server es bemerkte.

## Umsetzung
- Schlussrechnung kann „nach Schlussaufmaß" erstellt werden (Auswahl im Rechnungsdialog, nur bei Rechnungsart Schlussrechnung und vorhandenem Zwischenaufmaß).
- Rechtlich saubere Form: Die Schlussrechnung weist die **Gesamtleistung** (kumulierte Menge je Position × Preis) aus und zieht die Abschläge netto ab (§ 14 Abs. 5 UStG, bestehender Mechanismus). Zahlbar ist damit nur die Differenz (Beispiel: 1.250 m² − 1.200 m² abgerechnet = 50 m²).
- Im Rechnungstext steht eine Mengenübersicht je Position: gesamt, bereits abgerechnet, Rest.
- Zusatzpositionen (Kran, Nachträge, Statik, Rabatt) kommen wie bei der Angebotsbasis dazu.
- Server (`pruefeAufmassBezug`, neue Regel für `schluss`): Das Zwischenaufmaß muss das **letzte** sein, noch nicht abgerechnet, mit Preisen und Positionen; die ersten Rechnungspositionen müssen genau der Gesamtleistung entsprechen (Menge, Einheit, Preis). Abweichung → `AUFMASS_SCHLUSS_ABWEICHUNG`. Zuordnung und Sperre laufen wie beim Abschlag atomar (unveränderte DB-Funktionen, kein SQL).
- Standardrechnung mit Zwischenaufmaß bleibt gesperrt.
- Warnungen im Dialog: Mehrmenge über Vertrag, mehr abgerechnet als aufgemessen, und wenn der Abzug der Abschläge vom nach Zwischenaufmaß bereits abgerechneten Wert abweicht. Nichts wird still geändert.
- Nach der Schlussrechnung gilt die bestehende Prüfung: weitere Abrechnung überschreitet den Auftragswert und braucht eine dokumentierte Begründung; die Differenz eines späteren Zwischenaufmaßes bezieht sich auf die Schlussmenge. Storno der Schlussrechnung gibt das Aufmaß wieder frei.

## Geänderte Regel
Zwei bestehende Tests erwarteten „Zwischenaufmaß nur mit Abschlag". Sie wurden angepasst: Schlussrechnung ist nur mit der Gesamtleistung zulässig, Standardrechnung weiter nicht.

## Nicht Teil dieses Schritts
Automatische Auswahl der abzuziehenden Abschläge nach Zwischenaufmaß (heute Auswahl wie bisher mit Warnung bei Abweichung); Vorhaltung in Mengen (Schritt 5).
