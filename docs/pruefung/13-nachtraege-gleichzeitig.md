# Nachträge: gleichzeitiges Speichern ohne Verlust

**Problem:** Der Browser las alle Nachträge, änderte sie und schrieb die ganze Liste zurück. Zwei Personen (oder Büro und Baustelle) gleichzeitig → eine Änderung ging verloren.

**Jetzt:** Alle Änderungen laufen über `POST /api/nachtraege` (anlegen, Status, Betrag, löschen). Der Server liest die Liste mit Versionsnummer, wendet die Änderung an und schreibt per SQL-Funktion `nachtraege_setzen` nur, wenn die Version noch stimmt; sonst neu lesen und wiederholen (bis zu 6×, dann Meldung „bitte noch einmal versuchen“). Geschrieben wird nur der Schlüssel `nachtraege`.

- Nachträge bleiben in `projects.data.nachtraege`: Auftragsstand, Schlussrechnung, öffentlicher Auftragsstand lesen unverändert.
- Doppelt abgeschicktes Anlegen (Doppelklick) legt nur einen Nachtrag an. Betrag ändern/Löschen nur bei offenen Nachträgen, jetzt auch serverseitig.
- Rechte: Admin, Disposition, Bauleiter alles; Mitarbeiter/Lager nur Meldung von der Baustelle (ohne Betrag).
- `PATCH /api/projects` ignoriert `nachtraege` jetzt – ein veralteter Browser-Tab kann sie nicht mehr überschreiben.
- SQL: `supabase/phase-114-nachtraege-versionierung.sql` (Spalte `nachtraege_version`, Funktion). **Vor dem Merge ausführen**, sonst scheitert das Speichern von Nachträgen.

**Rest-Risiko:** Der allgemeine Speicherweg für Projektdaten (`PATCH /api/projects`) liest und schreibt weiter das ganze Datenobjekt; ein extrem knapp gleichzeitiger Nachtrag kann dort in einem Zeitfenster von Millisekunden überschrieben werden. Das ist ein eigenes, größeres Thema (alle Projektdaten).
