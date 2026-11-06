# API_AUTH_SCAN – SCAFFOLD OS

Erzeugt am 06.11.2026 per Skript (Textsuche, keine Ausführung). Das ist ein Hinweisfilter, kein Sicherheitsnachweis.
Erkannte Wächter: requireAuth, pruefeRolle, requireOwnEmployeeOrAdmin (lib/auth), pruefeCronAufruf, pruefeStatiker, importPruefeRolle, darfNwdKonvertieren, geheimnisGleich, auth.getUser.
Zusätzlich schützt proxy.ts Seiten nach Rolle; ob und wie es /api-Routen betrifft, ist noch nicht ausgewertet (Treffer dort: nur ein /api/-Bezug beim Demo-Ablauf).

Routen gesamt: 127

## A – Kein Wächter-Import erkannt (manuell prüfen, ob öffentlich gewollt)

- app/api/auth/demo-gate/route.ts (Handler: 1)
- app/api/lead/termin/route.ts (Handler: 2)
- app/api/track/besuch/route.ts (Handler: 1)

## B – Wächter importiert, aber kein Aufruf erkannt

- app/api/anfrage/route.ts (Handler: 1)
- app/api/public/angebot/route.ts (Handler: 2)
- app/api/public/ansicht/route.ts (Handler: 1)
- app/api/public/auftrag/anhang/route.ts (Handler: 1)
- app/api/public/auftrag/rechnung/route.ts (Handler: 1)
- app/api/public/auftrag/route.ts (Handler: 1)
- app/api/public/baustelle/datei/route.ts (Handler: 1)
- app/api/public/baustelle/route.ts (Handler: 1)
- app/api/public/rechnung-pruefung/anhang/route.ts (Handler: 1)
- app/api/public/rechnung-pruefung/route.ts (Handler: 2)
- app/api/stripe/webhook/route.ts (Handler: 1)
- app/api/umfrage/route.ts (Handler: 1)

## C – Verfeinerte Prüfung auf Handler-Ebene

Ein Handler gilt als geschützt, wenn sein Rumpf einen Wächter ruft (requireAuth, pruefeRolle, auth.getUser usw.) oder eine lokale Hilfsfunktion,
die selbst einen Wächter ruft (z. B. checkAdmin, checkCaller). Stichproben bestätigt: admin/data und provision rufen die Hilfsfunktion in jedem Handler auf.
Die erste Version dieser Datei hat Hilfsfunktionen nicht mitgezählt und deshalb 27 Routen fälschlich gemeldet.

Handler gesamt: 216; mit erkanntem Wächter: 198; ohne erkannten Wächter: 18

- app/api/anfrage/route.ts: POST
- app/api/auth/demo-gate/route.ts: POST
- app/api/lead/termin/route.ts: GET, POST
- app/api/public/angebot/route.ts: GET, POST
- app/api/public/ansicht/route.ts: GET
- app/api/public/auftrag/anhang/route.ts: GET
- app/api/public/auftrag/rechnung/route.ts: GET
- app/api/public/auftrag/route.ts: GET
- app/api/public/baustelle/datei/route.ts: GET
- app/api/public/baustelle/route.ts: GET
- app/api/public/rechnung-pruefung/anhang/route.ts: GET
- app/api/public/rechnung-pruefung/route.ts: GET, POST
- app/api/stripe/webhook/route.ts: POST
- app/api/track/besuch/route.ts: POST
- app/api/umfrage/route.ts: POST

## Hinweise zu A und B (Stichproben, keine Vollprüfung)

- stripe/webhook: Signaturprüfung vorhanden (constructEvent mit STRIPE_WEBHOOK_SECRET, Zeilen 286 bis 297).
- public/auftrag und weitere public/*-Routen: Zugriff über Token (Muster-Prüfung, Tabelle project_stand_links mit Ablauf- und Widerruffeldern).
  Nur an public/auftrag geprüft; die übrigen public/*-Routen sind nicht einzeln gelesen.
- auth/demo-gate, lead/termin, track/besuch: ohne Anmelde-Wächter; lead/termin und track/besuch nutzen oeffentlichRateLimitPruefen.
  lead/termin hat zusätzlich einen GET-Handler mit Service-Role-Zugriff; ob dieser Handler öffentlich sein soll, ist zu klären.

## Entscheidung zu lead/termin (06.11.2026)

GET liefert nur Datum und Uhrzeit belegter Slots (keine Personendaten) und antwortet mit 404, wenn LEAD_INBOX nicht gesetzt ist (Kundeninstanzen). POST hat Rate-Limit, Honeypot und Eingabeprüfung.
Entscheidung: GET bleibt öffentlich. Hinweis: Die einzige aufrufende Komponente (components/TerminBuchung.tsx) hat im Importgraph keinen Importeur; die Route wird vermutlich nicht mehr benutzt (Schlussfolgerung, nicht bestätigt).
Optionale Härtung: Rate-Limit auch für GET.
