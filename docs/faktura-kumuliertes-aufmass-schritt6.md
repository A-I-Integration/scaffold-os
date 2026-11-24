# Kumuliertes Aufmaß – Schritt 6: Nachtragsmenge je Position

**Was neu ist**
- Je Aufmaßposition gibt es neben der Vertragsmenge eine **Nachtragsmenge** (genehmigte Zusatzmenge) mit Verweis auf einen **vom Kunden bestätigten Nachtrag**.
- Vereinbarte Menge = Vertragsmenge + Nachtragsmenge. Die Mehrmengen-Warnung (Aufmaß, Schlussaufmaß, PDF) rechnet gegen diese Summe und nennt „Vertrag x + Nachtrag y".
- Server (`/api/projects`): eine neu gespeicherte Nachtragsmenge muss zu einem bestätigten Nachtrag dieses Auftrags gehören.
- Änderung oder Entfernen einer bestehenden Nachtragsmenge braucht eine Notiz. Nachtragsmenge ohne Vertragsmenge wird abgelehnt.
- Der Aufmaß-Fingerabdruck enthält die Nachtragsmenge: Änderung nach Reservierung wird erkannt.

**Doppelabrechnung**
Ein Nachtrag wird bisher als Pauschale/Position in der Schlussrechnung berechnet. Wird seine Menge über das Aufmaß abgerechnet, steht er im Schlussrechnungs-Dialog **nicht vorausgewählt** mit Hinweis „wird über das Aufmaß abgerechnet"; wird er trotzdem angehakt, erscheint eine Warnung. Es ist eine Warnung, keine Sperre.

**Nicht enthalten**: kein SQL, keine automatische Verknüpfung der Nachtragsbeträge mit Mengen, keine harte Sperre gegen doppeltes Abrechnen.
