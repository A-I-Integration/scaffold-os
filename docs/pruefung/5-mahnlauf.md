# Prüfung 5 – Mahn-Lauf

## Gefunden und behoben
1. **Mehr als 1000 offene Rechnungen:** Der tägliche Lauf las nur die ersten 1000 Zeilen (Grenze der Datenbank-Schnittstelle). Rechnungen dahinter wurden nie gemahnt. Jetzt wird seitenweise (500 pro Seite, nach ID sortiert) gelesen, bis alles bearbeitet ist.
2. **Zeitgrenze:** Der Lauf bricht kurz vor Ablauf der erlaubten Laufzeit sauber ab (`abgebrochen`); der Rest kommt am nächsten Lauf dran.
3. **Doppelte Mahnung:** Bisher wurde zuerst die Mail gesendet und danach der Stand gespeichert. Bei zwei gleichzeitigen Vorgängen (Cron-Wiederholung, Knopf in der Übersicht) konnte dieselbe Rechnung zweimal gemahnt werden. Jetzt wird der Stand zuerst bedingt gesichert (nur wenn der alte Stand noch gilt), erst dann gesendet. Scheitert der Versand, wird der alte Stand zurückgesetzt; scheitert auch das, kommt eine laute Meldung.

## Bekannter Kompromiss
Bricht der Server genau zwischen Sichern und Senden hart ab, gilt die Rechnung als gemahnt, ohne dass eine Mail raus ist. Das ist selten und sichtbar (Stand prüfen); die Gegenrichtung (doppelte Mahnung an Kunden) ist schlimmer.

## Tests
`__tests__/pruefung/mahnwesen.test.ts`, `mahnwesen-lauf.test.ts` (1230 Rechnungen, zweiter Lauf ohne Duplikate, Zeitbudget, zwei parallele Läufe). Ohne die Korrektur schlagen 7 dieser Tests fehl.
