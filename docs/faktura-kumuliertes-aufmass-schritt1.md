# Kumuliertes Aufmaß – Schritt 1: stabile Positions-ID

## Befund
Positionen wurden nur über den Namen (`name|einheit`) erkannt. Beim Umbenennen galt die alte Position als
„weggefallen" und die umbenannte als neu → bereits abgerechnete Menge wäre erneut abrechenbar (Doppelabrechnung).
Mit Test an altem Code belegt (7 Fehlschläge), nach der Änderung grün.

## Umsetzung
- Gespeicherte `key` einer Position bleibt beim Umbenennen erhalten (Übernahme nur, wenn der Key im bisherigen Stand existiert; erfundene Keys werden ignoriert).
- Altdaten ohne Key behalten den namensabgeleiteten Key (keine Migration nötig).
- Namenskollision mit anderer Position → eigene Identität (Suffix), doppelte Namen/Keys werden abgelehnt.
- Entfallene Position: wird mit Menge 0 mitgeführt und braucht eine Notiz (Begründung).
- Server (`pruefeAufmassAenderung`) prüft neue Zwischenaufmaße gegen den Stand davor.
- UI (`ZwischenaufmassBlock`) übernimmt den Key beim Vorbelegen und Anlegen.

## Nicht Teil dieses Schritts
Vertragsmenge je Position, kumuliertes PDF, Schlussaufmaß als Differenz, Vorhaltung in Mengen (Schritte 2–5).
