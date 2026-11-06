# RISK_REGISTER – SCAFFOLD OS

Stand: 06.11.2026 (Baseline vor Phase 1). Jeder Eintrag nennt den Beleg.
"Annahme" bedeutet: nicht verifiziert.

## Baseline-Zahlen

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| Vitest (erster Lauf) | 196 von 198 Dateien bestanden; 1594 von 1605 Tests bestanden, 8 fehlgeschlagen, 3 übersprungen | Terminalausgabe 06.11.2026 11:42 |
| Vitest (nach npm ci und Worker-Install) | 198 von 198 Dateien bestanden; 1602 Tests bestanden, 3 übersprungen | Terminalausgabe 06.11.2026 11:52 |
| TypeScript (tsc --noEmit) | Ausgabe leer; vermutlich keine Typfehler (Annahme, nicht bestätigt) | Terminalausgabe |
| ESLint | 1077 Fehler, 357 Warnungen | Terminalausgabe |

## Risiken

### R1 – Keine automatische Qualitätssicherung (hoch)
Der Ordner .github fehlt. Vor einem Merge läuft nichts automatisch (Tests, Typen, Lint).
Beleg: Verzeichnisprüfung im Repository.

### R2 – Worker-Abhängigkeiten nicht im Test-Setup (mittel, lokal behoben)
Die Pakete @gltf-transform/core, @gltf-transform/extensions und draco3dgltf stehen nur in workers/ki/package.json,
nicht im Haupt-package.json. Ohne Installation in workers/ki scheitern 6 Tests in
lib/cad/__tests__/ifc-import-worker.test.ts. Nach "npm ci" in workers/ki bestand die Datei.
Folge: Auf einem frischen Rechner oder in einer künftigen CI schlagen diese Tests fehl, solange der Worker-Install fehlt.

### R3 – LAZ-Test schlug fehl, Paket laz-perf nicht installiert (mittel, lokal behoben)
lib/__tests__/punktwolke-las-laz.test.ts: 2 Fehler in parseLaz (workers/punktwolke/las-laz.js, Zeile 79).
Hinweis: laz-perf steht im Haupt-package.json (devDependencies, ^0.0.7), aber node_modules/laz-perf existiert lokal nicht.
Ursache bestätigt: Fehlermeldung "LAZ-Dekompression nicht verfügbar: Cannot find module 'laz-perf'"; "npm ls laz-perf" zeigt (empty). Das Paket ist lokal nicht installiert.
Zusatz: In workers/punktwolke/package.json steht laz-perf als dependencies (0.0.7), im Haupt-package.json als devDependencies.
Die Version ist an zwei Stellen gepflegt.

### R4 – Lint-Schuld (mittel)
1077 Fehler nach Regel:
- @typescript-eslint/no-explicit-any: 910
- react-hooks/set-state-in-effect: 68
- react/no-unescaped-entities: 57
- @typescript-eslint/no-require-imports: 19
- react-hooks/preserve-manual-memoization: 7
- react-hooks/refs: 5
- @typescript-eslint/no-this-alias: 4
- übrige (prefer-const 2, react-hooks/immutability 2, no-html-link-for-pages 1, prefer-rest-params 1, no-assign-module-variable 1)

Nach Ordner: app 697, lib 206, components 134, __tests__ 16, workers 15, public 9.
Die workers/-Fehler sind nur ein kleiner Teil. public/ ist nicht aus dem Lint ausgeschlossen
(Annahme: dort liegen JavaScript-Dateien, die nicht geprüft werden sollten).
Die react-hooks-Regeln (set-state-in-effect, refs, immutability) können auf echte Laufzeitprobleme hinweisen; das ist je Fundstelle zu prüfen.

### R5 – Keine Migrationsverwaltung für die Datenbank (hoch)
74 SQL-Dateien in supabase/ (phase-N-..., migration-...), 28 mit Row Level Security, 85 create-policy-Anweisungen.
Reihenfolge und tatsächlicher Stand der Live-Datenbank sind im Repository nicht belegt.
Zusätzlich liegen SQL-Dateien im Repo-Root (z. B. lv-*.sql, rechnung-*.sql).
Offen: Schema-Dump der Datenbank (ohne Daten) als Vergleichsbasis.

### R6 – Git-Hygiene (niedrig bis mittel)
466 lokale Branches; 236 untrackte Einträge im Repo-Root, überwiegend .bundle- und .patch-Dateien.
Nichts davon wird gelöscht ohne ausdrückliche Freigabe.

### R7 – Git-Autorenname (niedrig)
111 von 1521 Commits laufen unter dem Namen "Dein Name" (vermutlich Platzhalter-Konfiguration).

### R8 – Agenten haben kein Architekturwissen (mittel)
AGENTS.md enthält nur den Next.js-Hinweis; CLAUDE.md verweist nur darauf.
Produktregeln und Architekturübersicht fehlen. Wird in Phase 1, Schritt 5 behoben (nach Freigabe).

Hinweis zu R2 und R3: Beide verschwanden durch Installation (Worker-Install in workers/ki bzw. npm ci im Hauptordner); am Code musste nichts geändert werden.
Offen bleibt, dass dieser Schritt nirgends dokumentiert oder automatisiert ist.

### R9 – Bekannte Schwachstellen in Abhängigkeiten (hoch)
npm audit (Mac, 06.11.2026): gesamt 31 (17 moderate, 9 high, 5 critical); nur Produktion (--omit=dev): 19 (9 moderate, 7 high, 3 critical).
Die Einordnung beruht auf den Advisory-Titeln aus der Terminalausgabe und auf Textsuchen im Code; die Advisory-Texte selbst wurden nicht gelesen.

Kritisch:
- next (installiert 16.2.12, fest eingetragen; Fix laut npm 16.4.5). Titel der Advisories: Remote Code Execution auf Windows-Servern, in der Image Optimization API mit AVIF,
  in next/og ImageResponse, Cache Poisoning bei SSG/ISR auf selbst betriebenen Servern.
  Im Code: next/og/ImageResponse wird nicht genutzt, next/image wird nirgends importiert, kein ISR (revalidate) gefunden; Hosting laut vercel.json auf Vercel.
  Ob die Image-Optimization-Route trotzdem erreichbar ist (next.config.ts hat keinen images-Block, also Standardwerte), ist nicht geklärt.
- @sentry/nextjs (Fix per npm audit fix): Titel "Middleware Bypass when using Tunnel route". next.config.ts setzt tunnelRoute auf /monitoring;
  das Advisory trifft also die Konfiguration. proxy.ts schützt Seiten nach Rolle und den Demo-Logout; API-Routen haben eigene Wächter (siehe API_AUTH_SCAN.md).
- dompurify (in package-lock als Abhängigkeit eines anderen Pakets, installiert 3.4.12; Fix ab 3.4.17): Im Code wird dompurify nirgends direkt benutzt,
  und es wurde kein .html()-Aufruf von jsPDF gefunden. Praktische Relevanz vermutlich gering (Annahme).

Weitere sichtbare High: xlsx (kein Fix; nur lib/export/statik-excel.ts und ein Test importieren es), sharp (Fix nur mit --force), zod und source-map-js (Fix per npm audit fix).
Empfohlene Reihenfolge: Branch, next und eslint-config-next gemeinsam anheben, npm audit fix, Tests, tsc und Build prüfen.

Stand nach Sicherheits-Update (Branch chore/sicherheits-updates, 06.11.2026 12:15 bis 12:20, Terminalausgabe der Nutzerin):
- Installiert wurden next 16.4.5 und eslint-config-next 16.4.5 (exakt), danach npm audit fix.
- Produktion (--omit=dev): 6 Schwachstellen (5 moderate, 1 high), vorher 19 (3 critical, 7 high, 9 moderate). Kein critical mehr in der Produktion.
- Alle Schwachstellen inkl. Entwicklungswerkzeuge: 17 (13 moderate, 2 high, 2 critical); die kritischen stammen laut Ausgabe aus dem Test-Werkzeug (tinypool über vitest);
  Fix nur mit vitest 5.1.0 (Breaking Change), betrifft Entwicklung, nicht den Betrieb (Annahme).
- Das verbleibende High in der Produktion ist sehr wahrscheinlich xlsx (kein Fix verfügbar); in der gekürzten Ausgabe nicht ausdrücklich bestätigt.
- Vitest: 199 von 199 Dateien bestanden, 1603 Tests bestanden, 3 übersprungen (eine Testdatei mehr als vorher durch neue Commits auf main).
- tsc: Ausgabe leer. Build: Routenübersicht und Proxy-Hinweis erschienen am Ende der Ausgabe; ein Build-Fehler wäre dort sichtbar gewesen (Schlussfolgerung aus der gekürzten Ausgabe).
- Nicht geprüft: Verhalten im Browser (Login, Rollenumleitung durch proxy.ts, Sentry-Tunnel /monitoring) nach dem Update.

### R10 – Install-Skripte nicht freigegeben (niedrig, Auswirkung unbekannt)
npm warnt, dass 7 Pakete Install-Skripte haben, die nicht über allowScripts abgedeckt sind: @sentry/cli, core-js, esbuild, fsevents,
sharp, tesseract.js, unrs-resolver. Ob dadurch ein Build oder Betrieb betroffen ist, wurde nicht geprüft.

### R11 – Sehr langer Einzeltest (niedrig)
lib/cad/__tests__/registrierung.test.ts braucht rund 34,6 s von insgesamt rund 37 s Laufzeit der gesamten Testsuite.
Beleg: Terminalausgabe 11:52.

### R12 – Zugriffsschutz der API-Routen (Befund, siehe API_AUTH_SCAN.md)
Verfeinerte Textsuche auf Handler-Ebene: 216 Handler, 198 mit erkanntem Wächter, 18 ohne (15 Routen: public/*, stripe/webhook, anfrage, umfrage, auth/demo-gate, lead/termin, track/besuch).
Die 18 wirken öffentlich gewollt (Token, Webhook-Signatur, Rate-Limit); nur stripe/webhook und public/auftrag sind im Detail gelesen. Offen: lead/termin GET (Service-Role-Zugriff).
Das ist ein Hinweisfilter und kein Sicherheitsnachweis.

### R13 – Service-Role-Schlüssel in fast allen Routen (Befund, Einordnung korrigiert)
105 von 127 Routendateien enthalten die Zeichenfolge SERVICE_ROLE. Der Service-Role-Schlüssel umgeht Row Level Security in Supabase.
Einordnung: Nach lib/provision/orchestrate.ts und supabase/phase-10-tenants.sql bekommt jeder Kunde ein eigenes Supabase-Projekt und ein eigenes
Vercel-Deployment (Kommentar im Code: "Weg A" = späterer Multi-Tenant-Umbau, noch nicht umgesetzt). Kundendaten liegen also in getrennten Datenbanken;
ein Mandantenfilter in den Routen ist heute kaum nötig (nur 2 Routen erwähnen tenant_id, mandant oder company_id).
Innerhalb einer Instanz hängt der Schutz der Rollen (admin, disponent, bauleiter, ...) am Code der Routen, nicht an den Policies.
Sollte später auf eine gemeinsame Datenbank umgestellt werden, wird ein Mandantenfilter in jeder dieser Routen zwingend.

### R14 – Schlüssel aller Kunden in der Master-Datenbank (hoch, Umsetzung ungeprüft)
Die Tabelle public.tenants (supabase/phase-10-tenants.sql) hat Spalten für supabase_anon_key und supabase_service_role_key je Kunde.
Das SQL-Kommentar sagt: RLS an, keine Policies, nur der Service-Role-Schlüssel der Master-Datenbank darf zugreifen.
Wer die Master-Datenbank oder deren Service-Role-Schlüssel erlangt, erhält Vollzugriff auf alle Kundeninstanzen.
Nicht geprüft: ob die Schlüssel in der Tabelle verschlüsselt gespeichert werden und ob sie in Logs oder API-Antworten auftauchen.
(Schlüsselwerte wurden nicht gelesen; nur Spaltennamen im SQL.)

### R15 – Schema-Stand je Kundeninstanz (hoch, offene Frage)
Das Datenbankschema wird beim Anlegen eines Kunden eingespielt (lib/provision/kunden-schema, erzeugt von scripts/build-kunden-schema.mjs aus supabase/kunden-schema.sql).
Spätere Änderungen liegen als phase-N-Dateien vor. Offen: Wie gelangen neue Migrationen in bereits bestehende Kundeninstanzen, und wo steht, welche Instanz auf welchem Stand ist?
Antwort der Nutzerin (06.11.2026): Neue SQL-Dateien werden über den Supabase-SQL-Editor eingespielt (von Hand, je Instanz).
Folge: Es gibt kein Protokoll, welche Instanz welche Datei bekommen hat; bei mehreren Kundeninstanzen driftet der Schema-Stand leicht auseinander. Die Dateien sind teils als "idempotent" kommentiert (z. B. phase-10-tenants.sql), das erleichtert Wiederholung, ersetzt aber kein Protokoll.
Verschärft R5 (keine Migrationsverwaltung).

### R16 – Zentrale Sicherheits- und Provisionierungslogik ohne direkte Tests (hoch, Befund aus TEST_COVERAGE_MAP.md)
Direkt importiert von keiner Testdatei: lib/auth.ts (123 Zeilen, von 113 API-Routen genutzt), lib/supabase/ (2 Module), lib/provision/ (6 Module, legt Kundeninstanzen an),
lib/actions/employees.ts (737 Zeilen), lib/actions/inventory.ts (383 Zeilen), lib/calculations/disposition.ts (333 Zeilen), lib/calculations/ki-rules.ts (499 Zeilen).
"Nicht direkt getestet" kann heißen, dass Tests sie indirekt durchlaufen; das wurde nicht geprüft. Zu lib/auth.ts: zwei Testdateien erwähnen den Pfad (app/api/nwd/__tests__/route.test.ts, lib/__tests__/baustellen-ergebnis-api.test.ts), zählen aber nicht als Import; vermutlich wird lib/auth dort nur ersetzt (Mock), nicht selbst geprüft. Gesamt: 182 von 354 Modulen direkt getestet (51 %),
lib/cad 91 %, lib/calculations 79 %, components/ nahezu 0 %.

### R17 – Mögliche tote Dateien (niedrig, nur gemeldet)
10 Dateien in lib, components und hooks ohne erkannten Importeur und ohne Test (u. a. components/TerminBuchung.tsx, components/AuthNav.tsx, lib/actions/media.ts);
siehe DEPENDENCY_GRAPH.md. Dynamische Aufrufe über zur Laufzeit gebildete Strings würden nicht erkannt.

### R18 – Zyklische Importe (niedrig)
Zwei Paare importieren sich gegenseitig: lib/calculations/cad-engine.ts mit lib/calculations/modell-stand.ts (cad-engine.ts hat 2704 Zeilen und wird von 46 Dateien genutzt)
sowie lib/geruest/regelpruefung.ts mit lib/geruest/richtwert-regeln.ts.

### R19 – Route nutzt Tabelle, die in keiner SQL-Datei vorkommt (mittel, Befund)
app/api/stueckliste/route.ts ruft /rest/v1/stuecklisten, aber "stuecklisten" steht in keiner SQL-Datei (auch nicht in supabase/kunden-schema.sql).
Auf frisch angelegten Kundeninstanzen würde die Route deshalb vermutlich fehlschlagen (Annahme). Möglich: Tabelle wurde einmal im Dashboard angelegt oder ist ein Altbestand und die Route ungenutzt.
Das ist ein Beispiel für R5/R15 (Schema im Repo und Live-Datenbank können auseinanderlaufen).

### R20 – Zwei Material-Engines ohne Abgleichstest (mittel, siehe DATA_FLOWS.md F1)
cad-engine.ts (CAD) und scaffold-engine.ts (Aufmaß/KI-Material) berechnen Material getrennt. Kein Test importiert beide; ob Stücklisten nach "Aufmaß → CAD" übereinstimmen, ist nicht durch Tests belegt.

### R21 – Feste Artikelpreise im Code als Fallback (mittel, siehe DATA_FLOWS.md F2)
26 Artikel mit Preisen in scaffold-engine.ts und ein statischer Fallback in article-prices.ts. Widerspricht der Produktregel "Preise gehören in die Firmendaten, nicht in den App-Code"; Wirkung auf neue Kundeninstanzen mit leerem Lager ungeprüft.

### R22 – Transportauftrag-Fehler bei der Annahme-Automatik bleibt unbemerkt (mittel, siehe DATA_FLOWS.md F6)
lib/angebot-annahme.ts: Schlägt das Anlegen des Transportauftrags nach einer erfolgreichen Reservierung fehl, gibt es keine Meldung. Material reserviert, aber ohne Transportauftrag und ohne Tourposition.

### R23 – Keine Rückabwicklung der automatischen Reservierung (niedrig, Schlussfolgerung, siehe DATA_FLOWS.md F7)
Teilfehler und Statuswechsel nach "angenommen" haben keine erkennbare Rückabwicklung; erneute Annahme könnte erneut auslösen (nicht geprüft).

### R24 – Ergebnis der Annahme-Automatik wird nicht angezeigt (mittel, siehe DATA_FLOWS.md F8)
Gespeichert in projects.data.lagerAutomatikErgebnis, aber keine Anzeige im Code; entgegen dem Kommentar in lib/angebot-annahme.ts.

Status R22 und R24 (06.11.2026): Fix vorbereitet auf Branch fix/annahme-ergebnis-sichtbar (neues Feld transportFehler, try/catch um den Transportauftrag, Anzeige an components/KundeAuftrag.tsx über components/LagerAutomatikHinweis.tsx,
2 neue Testdateien). Syntax geprüft, die Anzeige-Funktion in Node ausgeführt; die Vitest-Läufe und tsc stehen auf dem Mac der Nutzerin noch aus.

Ergänzung R20 (06.11.2026, gemessen): Dasselbe Gebäude ergibt im CAD-Weg 15 bis 28 % geringere Materialkosten und 12 bis 24 % weniger Gewicht als im Aufmaß-Weg (fünf Größen von 8 × 4,5 m bis 40 × 19,5 m, Fläche jeweils identisch). Siehe DATA_FLOWS.md F1. Absicherung der Gleichheit von Fläche und Artikelpreisen: Test auf Branch test/engine-abgleich.

### R25 – Verschiedene Regeln für Anker, Diagonalen und Kupplungen (hoch, fachliche Entscheidung nötig)
Gleiches Gebäude, verschiedene Stückliste (siehe DATA_FLOWS.md F1): z. B. bei 8 × 4,5 m im CAD-Weg 0 Anker, im Aufmaß-Weg 4; Diagonalen im Aufmaß-Weg 4- bis 5-mal so viele. Welche Regel gilt, entscheidet nicht der Code, sondern Statik und Zulassung (offen). Solange das offen ist, hängt Angebotspreis und Materialplanung davon ab, ob der Auftrag über das Aufmaß oder das CAD gerechnet wurde.

Präzisierung R19 (06.11.2026): Die Route /api/stueckliste (nur POST, Rolle admin oder bauleiter) wird von genau einer Stelle aufgerufen: handleSaveStueckliste in app/aufmass/schritt6/page.tsx
(Schreiben von project_id und material_list in die Tabelle stuecklisten). Im ganzen Code liest niemand diese Tabelle; die Materialliste steht ohnehin in projects.data.kiResult.materialList.
Die Tabelle fehlt in allen SQL-Dateien des Repos. Auf einer Instanz ohne diese Tabelle meldet die Seite beim Klick auf den Knopf nur "Fehler" (Alert), der Server liefert Status 500.
Ob die Tabelle in den bestehenden Instanzen existiert und Zeilen enthält, ist offen; Prüfung im SQL-Editor: select count(*) from stuecklisten;
Möglicher Weg: Knopf und Route entfernen (Daten liegen in projects.data), statt eine weitere Tabelle in jede Instanz einzuspielen (siehe R15). Entscheidung offen.
