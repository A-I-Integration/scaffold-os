# Fern-Annahme-Link fürs Angebot (Neuaufbau)

War schon einmal gebaut, ist in diesem Code-Stand aber nicht mehr
vorhanden gewesen – der Link in der E-Mail zeigte noch auf die
geschützte interne Seite (`/aufmass/schritt6?id=...`), die einen
Login verlangt. Kunden konnten das Angebot dadurch nicht wirklich
online ansehen oder annehmen.

## Jetzt neu aufgesetzt

- **Eigene Tabelle** `project_access_tokens`: ein nicht erratbarer
  Zufalls-Token pro Projekt, NICHT die interne Projekt-ID.
- **Beim Versenden eines Angebots** (`/api/email`, type "angebot")
  wird automatisch ein Token erzeugt (oder ein vorhandener
  wiederverwendet) und in den Link eingesetzt: `.../angebot/{token}`.
- **Neue öffentliche Seite** `/angebot/[token]`: kein Login nötig,
  zeigt nur Objekt, Gerüstklasse, Fläche und Endpreis – **keine**
  interne Kalkulation, keine anderen Projekte, keine sensiblen Daten.
- **„✓ Angebot annehmen"-Button**: setzt den Angebotsstatus auf
  "angenommen" (vermerkt "per Link angenommen"), danach reagiert der
  Rest der App genauso, als wäre vor Ort unterschrieben worden (z.B.
  wird in Schritt 6 der "Rechnung erstellen"-Button sichtbar).

## Sicherheit
- Der Token ist rein zufällig (48 Hex-Zeichen), nicht aus der
  Projekt-ID ableitbar.
- Die öffentliche Route liefert ausschließlich Daten zum EINEN
  passenden Projekt, nie eine Liste oder andere Kunden.
- Es wird nichts automatisch verschickt – wie beim Prüfprotokoll und
  der Rechnung bleibt der eigentliche Schritt (hier: Annehmen) eine
  bewusste Handlung des Kunden.

## Migration (einmalig in Supabase SQL-Editor)
`supabase/phase-33-fernannahme.sql`

Build lokal geprüft (npm install + next build), keine Fehler.

## Installation
- `app/api/access-token/route.ts` (neu)
- `app/api/public/angebot/route.ts` (neu)
- `app/angebot/[token]/page.tsx` (neu)
- `app/api/email/route.ts` (ersetzen)
