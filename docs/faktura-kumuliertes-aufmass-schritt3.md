# Kumuliertes Aufmaß – Schritt 3: PDF (Einzel- und Gesamtansicht)

## Umsetzung
- Je Zwischenaufmaß zwei PDFs (Schaltflächen „PDF Einzel" / „PDF kumuliert" im Zwischenaufmaß-Block):
  - **Einzelaufmaß** (Hochformat): nur die Menge dieser Periode: Pos., Beschreibung, Einheit, Menge, Einzelpreis, Gesamtpreis.
  - **Kumuliertes Aufmaß** (Querformat): Pos., Beschreibung, Einheit, Vertrag, Gesamt kumuliert, bereits abgerechnet, jetzt abrechenbar, Einzelpreis, Betrag.
- Beide mit Auftraggeber/Baustelle, Notiz, Hinweisen (Mehrmenge, mehr abgerechnet als aufgemessen), Unterschriftsfeldern; Beträge netto; keine internen Kosten.
- Der Stand „bisher abgerechnet" ist der Stand VOR dem jeweiligen Zwischenaufmaß: ein früheres, schon abgerechnetes Aufmaß zeigt deshalb auch nach späteren Abrechnungen seine ursprüngliche Periode.
- Altes Aufmaß nur mit Gesamtfläche: Mengen werden gezeigt, Preise als „–".
- Reine Datenlogik (`baueAufmassBeleg`) getrennt von der PDF-Zeichnung; Dokument wird nur heruntergeladen, am Auftrag ändert sich nichts.

## Nicht Teil dieses Schritts
Ablage des PDFs unter „Dokumente" am Projekt, Versand per E-Mail, Fotos/Unterschrift als Bild im PDF, Nachträge als eigene Mengenart.
