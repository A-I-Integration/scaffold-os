# Vorhaltung: Abmeldung, Freigabe und tatsächlicher Abbau getrennt

Im Gerüstbau sind das verschiedene Ereignisse an verschiedenen Tagen. Sie werden getrennt erfasst; welches Datum die Abrechnung bestimmt, legt die Vorhaltevereinbarung je Auftrag fest.

**Erfasst wird**
- Aufbau fertig / Übergabe (Dokumentation)
- je Teilabbau: tatsächlicher Abbau (`datum`), Abmeldung durch den Kunden, Freigabe zum Abbau, Bereich, Verantwortlicher, Nachweis (Text, z. B. Protokoll-/Foto-Nr.)
- vollständiger Abbau: tatsächlich, Abmeldung, Freigabe, Verantwortlicher, Nachweis
- abgebaute Menge und Restbestand je Teilabbau gibt es seit Schritt 5 (m², Restmenge)

**Maßgebliches Datum (`stichtagModus`)**: tatsächlicher Abbau (Standard, wie bisher), Abmeldung durch den Kunden oder Freigabe zum Abbau. Für Teilabbauten und den vollständigen Abbau gilt dann das gewählte Datum für Verringerung bzw. Ende der Vorhaltung. Das gespeicherte tatsächliche Abbaudatum bleibt unverändert.

**Sicherungen**
- Fehlt das gewählte Datum, wird nicht abgerechnet; die Meldung nennt, was fehlt. Es wird nie still mit einem anderen Datum gerechnet.
- Nach der ersten Abrechnung darf der Stichtag nicht so umgestellt werden, dass berechnete Zeiträume sich ändern (bestehende Prüfung der Intervalle). Nur Dokumentation (Verantwortlicher, Nachweis, Übergabe) bleibt änderbar.
- Hinweis, wenn Abmeldung/Freigabe nach dem tatsächlichen Abbau liegen.
- Der Verlauf nennt das maßgebliche Datum.

**Nicht enthalten**: Foto-Upload als Nachweis (nur Verweistext), Ereignisse je Gerüstbereich mit eigener Menge außer über die Teilabbau-Zeilen, kein SQL.
