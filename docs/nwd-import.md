# NWD-Import (Navisworks → Teile-Modell)

Ablauf: `.nwd` hochladen → Umwandlung in der Autodesk-Cloud (APS, Model Derivative) → Ergebnis (OBJ) im Browser einlesen →
dieselbe Formerkennung wie bei OBJ/STL (`analysiereDreiecke`), Teile mit `quelle: 'nwd'`. Kein eigenes NWD-Parsing.

## Einrichtung (einmalig je Instanz)
1. Bei https://aps.autodesk.com eine App anlegen (Typ „Server-to-Server“/„Traditional Web App“), Model Derivative und OSS aktivieren.
2. Migration `supabase/phase-103-nwd-jobs.sql` im Supabase SQL Editor ausführen.
3. Env-Variablen in Vercel: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_BUCKET` (weltweit eindeutiger Name, Kleinbuchstaben/Ziffern/`-_.`).
   Optional: `NWD_TAGESLIMIT` (Standard 20 je Instanz und Tag), `APS_WEBHOOK_SECRET` (nur für den Webhook).
4. `npm run aps:diagnose` mit denselben Variablen: zeigt, welche Ausgabeformate Autodesk für NWD wirklich anbietet.
5. Optional Webhook (nur Beschleuniger, Abfrage alle 20 s funktioniert auch ohne): Autodesk-Webhook für das Ereignis
   „extraction.finished“ auf `https://<instanz>/api/nwd/webhook?token=<APS_WEBHOOK_SECRET>` registrieren.

## Schutz vor Kosten
Höchstens 1 Konvertierung pro Minute und Nutzer, Tageslimit je Instanz (`NWD_TAGESLIMIT`), Hinweis in der Oberfläche,
Dateien bei Autodesk und im Storage werden nach Erfolg/Fehler gelöscht (Reste nach 24 h beim nächsten Upload).

## Bekannte Grenzen / ungeprüft
Siehe PR-Beschreibung: Format der Autodesk-Ausgabe (OBJ statt glTF), Manifest-Form, Webhook-Format und Browser-Upload (CORS) wurden
ohne echte Zugangsdaten gebaut und sind vor dem Einsatz mit einer echten NWD-Datei zu prüfen.
