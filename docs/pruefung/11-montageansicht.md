# Montageansicht (Handy, per Link/QR)

Die öffentliche 3D-Ansicht (`/ansicht/[Link]`, QR-Code aus der Kundenseite) gab es schon: 3D-Modell, Stückliste ohne Preise, AR.
Neu in der Ansicht, Bereich „Montage":

- **Schnitt:** Seiten und Lagen einzeln ausblenden/einblenden (Anker und Bauteile ohne Feld bleiben sichtbar).
- **Markieren:** Bauteil antippen → „Ausgewähltes markieren"; „Sichtbares markieren" (passt zum Schnitt); „Markierung löschen". Markierte Teile sind rot. Zähler „x von y Bauteilen", je Artikel aufklappbar.
- Die Markierung liegt nur im Browser des Geräts (je Link getrennt). Der öffentliche Link kann nichts speichern oder ändern. Wechselt das Modell, fallen unbekannte Markierungen weg.
- Im Statiker-Bereich erscheint dieselbe Ansicht; Markierungen gelten dort nur bis zum Neuladen.

**Keine Datenbankänderung.** Logik: `lib/montage-ansicht.ts`, Tests: `lib/__tests__/montage-ansicht.test.ts`.

**Grenzen:** Der Schnitt arbeitet mit Seiten und Lagen, nicht mit einer frei verschiebbaren Schnittebene. Gemeinsame Markierung mehrerer Geräte (Team-Fortschritt) bräuchte Speicherung auf dem Server mit Schreibrecht für den Link und ist ein eigener Schritt. Die Bildschirmdarstellung habe ich nicht auf einem echten Handy geprüft.
