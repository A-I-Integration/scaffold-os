# Prüfung 7 – Angebotsannahme, Nachträge, Abrechnung nach m²

## Gefunden und behoben
1. **Doppelte Lagerreservierung bei erneuter Annahme:** Wurde ein Angebot nach einer Korrektur ein zweites Mal angenommen, buchte die Automatik das Material erneut ab (Lager doppelt belastet, zweiter Transportauftrag). Jetzt wird je Artikel geprüft, was für dieses Projekt schon über die Annahme reserviert wurde, und nur die **fehlende Menge** gebucht. Wurde die Menge erhöht, kommt nur die Differenz dazu. Ist die bisherige Reservierung nicht lesbar, wird nichts gebucht und es wird gemeldet.
2. **Derselbe Artikel in mehreren Zeilen der Materialliste:** Die Mengen werden jetzt je Artikel zusammengezählt und einmal gebucht.
3. **Abrechnung nach m², Preis speichern:** Beim Anlegen wurde ein Preis wie "1.250,50" zwar richtig geprüft, aber als 1,25 gespeichert. Prüfen und Speichern nutzen jetzt dieselbe Zahlenregel (`lib/zahl-eingabe.ts`).

## Geprüft, ohne Befund
- Nachträge werden nur als bestätigte in die Schlussrechnung übernommen; je Auftrag gibt es nur eine Schlussrechnung, eine doppelte Abrechnung eines Nachtrags ist darüber ausgeschlossen.
- Leistungszeilen (Sonderteil) werden nicht ans Lager gebucht; unbekannte Artikel und Einheitenkonflikte werden gemeldet.

## Bekannte Grenzen (bewusst nicht geändert)
- **Verringerte Menge nach Korrektur:** Bereits reserviertes Material wird nicht automatisch zurückgebucht (Rückgabe bleibt Handarbeit).
- **Gleichzeitige Annahme in derselben Millisekunde** (zwei Aufrufe, bevor der erste gebucht hat) ist ohne Datenbank-Sperre nicht vollständig auszuschließen; die Prüfung deckt den üblichen Fall (nacheinander) ab.
- **Nachträge liegen im Projekt-Datenblock (`data.nachtraege`).** Melden zwei Personen gleichzeitig einen Nachtrag bzw. speichert das Büro gleichzeitig, gewinnt der letzte Schreiber, ein Eintrag kann verloren gehen. Sauber lösbar nur mit einer eigenen Tabelle oder einer Versionsprüfung (Datenbank-Änderung) – Entscheidung nötig.
- **Zahleneingabe "1.500" ohne Komma** wird in Nachträgen als 1500 gelesen, in der gemeinsamen Regel als 1,5. Bleibt offen, bis entschieden ist, welche Lesart gelten soll.
