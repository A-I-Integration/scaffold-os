# Kumuliertes Aufmaß – Schritt 2: Vertragsmenge je Position

## Umsetzung
- Je Position optional `vertragsmenge` (vereinbarte Menge), gespeichert im Zwischenaufmaß wie Preis und Menge (keine Schema-Änderung, kein SQL).
- Wird bei Folgeständen automatisch übernommen; Positionen ohne Vertragsmenge werden nicht gegen den Vertrag geprüft (Altdaten bleiben unverändert gültig).
- Je Zeile berechnet: `mehrmenge` (kumuliert über Vertrag) und `neuMehrmenge` (der Teil, der in genau dieser Abrechnung neu über den Vertrag hinausgeht, auch nach bereits abgerechneter Mehrmenge).
- Rechnungsdialog: Mehrmengen-Warnung mit Hinweis auf Nachtrag/Vereinbarung. Die Rechnungsmengen bleiben die Differenz zum bereits Abgerechneten.
- Änderung einer bereits gesetzten Vertragsmenge braucht eine Notiz (Nachvollziehbarkeit, z. B. Nachtrag); gilt im Dialog und serverseitig. Erstmaliges Setzen braucht keine.
- Abgerechnete Zwischenaufmaße bleiben gesperrt (auch die Vertragsmenge darin).

## Entscheidungen
- Mehrmenge ist eine Warnung, keine Sperre: tatsächlich ausgeführte Mehrmengen sind abrechenbar, sollen aber bewusst und nachvollziehbar behandelt werden.
- Die Vertragsmenge wird NICHT aus dem Aufmaßblatt vorbelegt (das wäre eine Annahme, die still zum Vertrag würde).
- Leeres Feld = bisherige Vertragsmenge bleibt. Entfernen einer Vertragsmenge ist nicht vorgesehen.

## Offen (spätere Schritte)
Nachträge als eigene Mengenart (Menge aus genehmigtem Nachtrag), kumuliertes PDF, Schlussaufmaß als Differenz, Vorhaltung in Mengen.
