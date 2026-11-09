# Prüfung 9 – Öffentliche Kunden-Links

## Gefunden und behoben
- **Startpasswort mit vorhersagbarem Zufall:** Beim Anlegen eines Zugangs (Seite Mitarbeiter) wurde das Passwort mit `Math.random` erzeugt, das nicht für Geheimnisse gedacht ist. Jetzt aus dem Zufallsgenerator des Systems (`lib/passwort.ts`), 12 Zeichen ohne verwechselbare Zeichen.

## Geprüft, ohne Befund (jetzt mit Tests abgesichert)
- Angebot, Auftragsstand, Baustellenmappe, 3D-Ansicht und Rechnungsprüfung liefern nur das eine zum Link passende Projekt bzw. die eine Rechnung. Interne Felder (Mahnstufe, Notizen, andere Projekte) erscheinen nicht.
- Abgelaufene, widerrufene, unbekannte, zu kurze und manipulierte Links antworten mit 404.
- Links sind 192 Bit lang (zufällig aus der Datenbank), nicht erratbar.
- Annahme per Link: löst die Lager-Automatik genau einmal aus; eine zweite Annahme meldet "bereits angenommen"; Ablehnen nach Annahme ist nicht möglich; eine Korrektur braucht eine Notiz und löst nichts im Lager aus.

## Zur Entscheidung
- **Der Angebots-Link (Fernannahme) gilt unbegrenzt** und lässt sich nicht widerrufen (ein Link je Projekt, ohne Ablaufdatum). Die anderen Links (Auftragsstand, Mappe, Ansicht, Rechnungsprüfung) haben Ablauf und Widerruf. Soll der Angebots-Link nach der Annahme bzw. nach einer Frist ablaufen und widerrufbar sein?
