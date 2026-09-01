# Kunden -> Auftraege, Angebot, Rechnung, Fotos, Dokumentation, E-Mail-Verlauf

## Wichtig: Das meiste war schon da
Die Komponente components/KundeAuftrag.tsx und der Grossteil der
Anbindung (Angebot-Link, Rechnungen pro Auftrag, Zusatzrechnung,
Fotos, Dokumentation) lag bereits fertig in deinem Projektordner
(uncommittet, vermutlich von Kimi). Ich habe das geprueft und nur
das ergaenzt, was noch fehlte:

1. Fertig verdrahtet: KundeAuftrag war programmiert, aber noch
   nicht in app/kunden/page.tsx eingebaut. Jetzt laedt die
   Kunden-Seite auch /api/projects und zeigt pro Kunde alle
   passenden Auftraege (Zuordnung ueber den Namen, gleiches Prinzip
   wie bei Rechnungen). Rechnungen, die keinem Auftrag zugeordnet
   werden konnten, stehen weiterhin separat darunter - nichts geht
   verloren.

2. Neu gebaut: E-Mail-Verlauf (nur ausgehend)
   - supabase/phase-20-email-log.sql: neue Tabelle email_log
   - app/api/email/route.ts: protokolliert jetzt jeden Versand
   - app/api/email-log/route.ts: liest den Verlauf pro Projekt
   - In KundeAuftrag.tsx unter "Fotos, Dokumentation & E-Mail-Verlauf"
   - app/kunden/page.tsx und app/rechnungen/page.tsx: senden jetzt
     die projectId mit, damit Rechnungs-/Mahnungs-Mails dem
     richtigen Auftrag zugeordnet werden

## Grenze, die ich nicht eigenmaechtig loesen wollte
Das ist nur der ausgehende Versand. Echte Antworten des Kunden
("hin und her") werden nicht erfasst - das braeuchte eine eigene
Anbindung (z. B. eine bei Resend verifizierte eigene Domain mit
Inbound-Webhook, oder Abruf eines echten Postfachs). Aktuell
versendet ihr ueber onboarding@resend.dev (Resend-Testadresse),
Antworten darauf kommen technisch nirgends bei euch an.

## Installation
1. supabase/phase-20-email-log.sql in Supabase ausfuehren
2. Dateien kopieren (alle sind Ersetzungen bestehender Dateien,
   ausser der Migration und email-log/route.ts, die neu sind)
3. Zusammen mit den bereits vorhandenen, noch nicht gepushten
   Aenderungen committen (siehe git status - da liegt einiges,
   auch von Phase 18/19)
