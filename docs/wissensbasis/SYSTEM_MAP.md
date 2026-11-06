# SYSTEM_MAP – SCAFFOLD OS

Erzeugt am 06.11.2026 aus dem Repository (Stand Branch chore/sicherheits-updates). Alle Zahlen stammen aus den versionierten Dateien.

## Technik

- Next.js 16.4.5 (App Router, Datei proxy.ts statt middleware.ts), React 19, TypeScript, Tailwind 4, three.js / react-three-fiber (3D), web-ifc (IFC), Supabase (Datenbank, Auth), Stripe, Sentry, Vitest
- Betriebsmodell laut Code: eine Supabase- und eine Vercel-Instanz je Kunde, angelegt durch lib/provision/orchestrate.ts; eine Master-Datenbank mit Tabelle tenants.
- Hosting: Vercel (vercel.json mit 4 Cron-Aufrufen).

## Bereiche (versionierte Code-Dateien)

| Bereich | Dateien | Zeilen |
|---|---|---|
| app | 210 | 41387 |
| components (Wurzel) | 46 | 7011 |
| components/aufmaß | 14 | 2351 |
| components/cad | 27 | 7071 |
| components/dashboard | 4 | 501 |
| components/datenpflege | 2 | 191 |
| components/lager | 2 | 293 |
| components/landing | 2 | 673 |
| components/marketing | 1 | 181 |
| components/rechnung | 2 | 187 |
| components/win | 3 | 327 |
| eslint.config.mjs | 1 | 19 |
| hooks | 1 | 70 |
| lib (Wurzel) | 119 | 12090 |
| lib/actions | 4 | 1263 |
| lib/cad | 58 | 9044 |
| lib/calculations | 14 | 5712 |
| lib/data | 2 | 259 |
| lib/export | 11 | 1712 |
| lib/geruest | 4 | 906 |
| lib/inventory | 1 | 236 |
| lib/nwd | 4 | 645 |
| lib/offline | 2 | 75 |
| lib/provision | 6 | 837 |
| lib/supabase | 2 | 40 |
| lib/touren | 6 | 426 |
| next.config.ts | 1 | 50 |
| postcss.config.mjs | 1 | 8 |
| proxy.ts | 1 | 195 |
| public | 3 | 287 |
| scripts | 5 | 128 |
| types | 6 | 675 |
| vitest.config.ts | 1 | 20 |
| workers/ki | 5 | 1870 |
| workers/punktwolke | 6 | 1576 |

Test-Dateien: 201

## Seiten (app/**/page.tsx)

Anzahl: 74

| URL | Datei |
|---|---|
| /abo-verwalten | app/abo-verwalten/page.tsx |
| /admin/besucher | app/admin/besucher/page.tsx |
| /admin/kunden | app/admin/kunden/page.tsx |
| /admin/wirkung | app/admin/wirkung/page.tsx |
| /agb | app/agb/page.tsx |
| /anfrage | app/anfrage/page.tsx |
| /angebot-geruestbau | app/angebot-geruestbau/page.tsx |
| /angebot/[token] | app/angebot/[token]/page.tsx |
| /ansicht/[token] | app/ansicht/[token]/page.tsx |
| /arbeitsschutz | app/arbeitsschutz/page.tsx |
| /aufmass-geruestbau | app/aufmass-geruestbau/page.tsx |
| /aufmass/schritt1 | app/aufmass/schritt1/page.tsx |
| /aufmass/schritt2 | app/aufmass/schritt2/page.tsx |
| /aufmass/schritt3 | app/aufmass/schritt3/page.tsx |
| /aufmass/schritt4 | app/aufmass/schritt4/page.tsx |
| /aufmass/schritt5 | app/aufmass/schritt5/page.tsx |
| /aufmass/schritt6 | app/aufmass/schritt6/page.tsx |
| /auftrag/[token] | app/auftrag/[token]/page.tsx |
| /baustelle/[token] | app/baustelle/[token]/page.tsx |
| /cad/bruecke | app/cad/bruecke/page.tsx |
| /cad/feldtest | app/cad/feldtest/page.tsx |
| /cad | app/cad/page.tsx |
| /cad/pylon | app/cad/pylon/page.tsx |
| /cad/traggeruest | app/cad/traggeruest/page.tsx |
| /dashboard | app/dashboard/page.tsx |
| /datenimport | app/datenimport/page.tsx |
| /datenpflege | app/datenpflege/page.tsx |
| /datenschutz | app/datenschutz/page.tsx |
| /disposition-geruestbau | app/disposition-geruestbau/page.tsx |
| /dokumentation | app/dokumentation/page.tsx |
| /dokumente | app/dokumente/page.tsx |
| /eignungscheck | app/eignungscheck/page.tsx |
| /einstellungen | app/einstellungen/page.tsx |
| /fahrer | app/fahrer/page.tsx |
| /gaeb | app/gaeb/page.tsx |
| /hilfe | app/hilfe/page.tsx |
| /impressum | app/impressum/page.tsx |
| /kaufen/erfolg | app/kaufen/erfolg/page.tsx |
| /kaufen | app/kaufen/page.tsx |
| /kolonnen | app/kolonnen/page.tsx |
| /kunden/[id] | app/kunden/[id]/page.tsx |
| /kunden/import | app/kunden/import/page.tsx |
| /kunden | app/kunden/page.tsx |
| /lager-geruestbau | app/lager-geruestbau/page.tsx |
| /lager | app/lager/page.tsx |
| /login | app/login/page.tsx |
| /meine-email | app/meine-email/page.tsx |
| /meine-touren | app/meine-touren/page.tsx |
| /mietabrechnung | app/mietabrechnung/page.tsx |
| /mitarbeiter | app/mitarbeiter/page.tsx |
| /mj-katalog | app/mj-katalog/page.tsx |
| /nachunternehmer | app/nachunternehmer/page.tsx |
| /onboarding | app/onboarding/page.tsx |
| /open-source | app/open-source/page.tsx |
| / | app/page.tsx |
| /passwort-reset | app/passwort-reset/page.tsx |
| /passwort-vergessen | app/passwort-vergessen/page.tsx |
| /planung | app/planung/page.tsx |
| /prognose | app/prognose/page.tsx |
| /rechnung-geruestbau | app/rechnung-geruestbau/page.tsx |
| /rechnung-pruefen/[token] | app/rechnung-pruefen/[token]/page.tsx |
| /rechnungen/[id] | app/rechnungen/[id]/page.tsx |
| /rechnungen | app/rechnungen/page.tsx |
| /register | app/register/page.tsx |
| /routenoptimierung | app/routenoptimierung/page.tsx |
| /statiker/[id] | app/statiker/[id]/page.tsx |
| /statiker | app/statiker/page.tsx |
| /stueckliste | app/stueckliste/page.tsx |
| /touren | app/touren/page.tsx |
| /verify | app/verify/page.tsx |
| /wechseln | app/wechseln/page.tsx |
| /wochenplanung | app/wochenplanung/page.tsx |
| /zahlungsabgleich | app/zahlungsabgleich/page.tsx |
| /zeiterfassung | app/zeiterfassung/page.tsx |

## Rollen-Zugriff auf Seiten (proxy.ts, ROLE_ACCESS)

Gelesen aus der Tabelle in proxy.ts; der erste passende Pfad gilt.

| Pfad | erlaubte Rollen |
|---|---|
| /dashboard | admin, disponent |
| /aufmass | admin, bauleiter |
| /stueckliste | admin, bauleiter |
| /lager | admin, disponent, bauleiter, lager |
| /prognose | admin, disponent, lager |
| /mj-katalog | admin, disponent, bauleiter, lager |
| /planung | admin, disponent, bauleiter |
| /zeiterfassung | admin, disponent, bauleiter |
| /touren | admin, disponent |
| /routenoptimierung | admin, disponent |
| /mitarbeiter | admin, disponent |
| /datenpflege | admin |
| /meine-touren | admin, disponent, bauleiter, mitarbeiter, lager |
| /fahrer | admin, disponent, bauleiter, mitarbeiter, lager |
| /cad/feldtest | admin |
| /cad | admin, disponent, bauleiter |
| /kunden | admin, disponent |
| /arbeitsschutz | admin, disponent |
| /rechnungen | admin, disponent |
| /zahlungsabgleich | admin, disponent |
| /mietabrechnung | admin, disponent |
| /statiker | statiker |

## Weitere Dokumente

- API_MAP.md (127 Routen), API_AUTH_SCAN.md (Zugriffsschutz), DATABASE_MAP.md (Tabellen), MODULE_REGISTRY.md, DEPENDENCY_GRAPH.md, TEST_COVERAGE_MAP.md, RISK_REGISTER.md

## Nicht Teil dieses Dokuments

- Fachliche Datenflüsse (Aufmaß, CAD, LV, Angebot, Rechnung) und die Zuordnung von Tabellen zu Modulen: noch nicht erstellt, brauchen Lesen der Fachlogik.
