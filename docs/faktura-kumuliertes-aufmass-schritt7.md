# Kumuliertes Aufmaß – Schritt 7: Positionsstatus je Gerüstbereich

**Ausgangslage (geprüft):** Dach und Fassade sind im Aufmaß getrennte Positionen mit stabiler Positions-ID, Vertragsmenge, Nachtragsmenge und kumulierter Abrechnung je Position. Der Ablauf „65 % abgerechnet → Dach abgebaut → Dach auf 100 % → nur die fehlenden 35 % abrechnen" läuft damit schon über die Zwischenaufmaße. Es fehlten die Abbauereignisse je Position und die Übersicht je Gerüstbereich.

**Neu** (Kunde → Tab „Nachträge / Schluss" → Block „Positionsstatus (je Gerüstbereich)", unter dem Zwischenaufmaß)
- Je Position: Vertrag (Menge, Wert), **Leistungsstand** (aufgemessen ÷ vereinbart), **Abrechnungsstand** (abgerechnet ÷ vereinbart), **noch abrechenbar** (aus Aufmaß und bis zur vereinbarten Menge), Status (steht noch / teilweise abgebaut / abgebaut), Restmenge auf der Baustelle.
- Ereignisse je Position, getrennt: Abmeldung durch den Kunden, Freigabe zum Abbau, geplanter Abbau, tatsächlicher Abbau (abgebaute Menge oder „vollständig", Ansprechpartner, Nachweis-Verweis, Notiz).
- Hinweise: abgebaut, aber Aufmaß noch nicht auf dem Endstand; Abmeldung nach Abbau; geplanter Abbau überfällig; mehr abgerechnet als aufgemessen.

**Sicherungen**
- Ereignisse sind ein Verlauf: nur anfügen, nie ändern oder löschen (Server, 409). Ein veralteter Client überschreibt keine zwischenzeitlich erfassten Ereignisse.
- Tatsächlicher Abbau nicht in der Zukunft; insgesamt abgebaut nie mehr als vorhanden; nach vollständigem Abbau kein weiterer Abbau.
- Ereignisse ändern keine Beträge. Abgerechnet wird weiter nur über das Zwischenaufmaß.

**Bewusst nicht enthalten (spätere Schritte)**
- Zahlungsstand je Position (Zahlungen gehören zur Rechnung, nicht zur Position).
- Automatisches Setzen des Aufmaßes auf 100 % beim Abbau (heute: Hinweis, Aufmaß selbst auf den Endstand zu setzen).
- Verknüpfung der Abbauereignisse mit dem Teilabbau der Vorhaltung.
- Datei-Upload als Nachweis (nur Verweistext).
- Kein SQL nötig (`projects.data.positionsEreignisse`).
