# Prüfung 4: Rechte und Sicherheit

Methode: automatische Tests. Jede API-Route wird ohne Login und mit jeder Rolle aufgerufen; die
Datenbank-Regeln (RLS) werden auf einer echten PostgreSQL-Datenbank als „nicht eingeloggt“ und als
Mitarbeiter geprüft. Tests: `__tests__/pruefung/rechte-routen.test.ts` (288 Fälle),
`__tests__/pruefung/seiten-rollen.test.ts`, `supabase/tests/phase-111-rls-haerten.test.sql`.

## Gefundene Fehler und Korrekturen

### Datenbank (phase-111-rls-haerten.sql) – der schwerste Fund
| # | Fehler | Folge | Korrektur |
|---|--------|-------|-----------|
| 1 | `profiles`: jeder Eingeloggte durfte seine eigene Zeile ändern, auch die Spalte `role` | Ein Mitarbeiter konnte sich über die öffentliche Datenbank-Schnittstelle selbst zum Admin machen | Nur noch Name und Firma änderbar (Spaltenrecht) |
| 2 | `profiles`: Lesen und Anlegen für „public“ | Ohne Login alle Profile (Name, E-Mail, Rolle) lesbar | Nur Eingeloggte lesen; Anlegen nur über die API |
| 3 | `projects` für „public“ lesbar | Alle Baustellen samt Daten ohne Login lesbar | Nur Eingeloggte |
| 4 | `site_stock` für „public“ änderbar | Baustellenbestand ohne Login änderbar | Nur Eingeloggte |
| 5 | Rechnungen, Kunden, Zeiteinträge, Firmendaten, Fahrzeuge, Touren, Stopps, GPS: „alles für jeden Eingeloggten“ | Rollenprüfungen der API umgehbar | Policy entfernt (die App nutzt diese Tabellen nur über die API) |
| 6 | Mitarbeiter, Abwesenheiten, Lager, Transportaufträge u. a. für „public“ | Zugriff ohne Login | Auf „Eingeloggte“ beschränkt |

Nachweis: Der Test schlägt ohne die Migration in 7 Punkten fehl und läuft mit ihr durch.
**Wichtig:** geprüft wurde das Schema aus `supabase/kunden-schema.sql`. Ob die echte Datenbank genauso
aussieht, sagt diese Abfrage (vorher und nachher ausführen):

    select tablename, policyname, roles, cmd from pg_policies
    where schemaname = 'public' and (qual = 'true' or with_check = 'true') order by 1, 2;

### API-Routen
| Route | Fehler | Korrektur |
|-------|--------|-----------|
| `invoices` GET, `invoice-payments` GET | Jede Rolle (auch Lager, Mitarbeiter) las alle Rechnungen und Zahlungen | nur Admin und Disposition |
| `time-entries` GET | Jeder Eingeloggte sah die Zeiten aller Kollegen | Mitarbeiter und Lager sehen nur eigene; Admin, Disposition, Bauleiter alle |
| `email-log` GET, `kunden/[id]/emails` GET | Kundenkorrespondenz für jeden Eingeloggten | nur Admin und Disposition (wie der Versand) |
| `project-assignments` POST/DELETE | Jede Rolle konnte Zuordnungen anlegen und löschen; Bauleiter ohne eigenen Datensatz umging die Kolonnenprüfung; Löschen ohne Kolonnenprüfung | Rollen Admin/Disposition/Bauleiter; Bauleiter nur eigene Kolonne, ohne Datensatz verweigert |
| `admin/users` POST | Disposition konnte einen Admin-Zugang anlegen (Rechte-Ausweitung) | nur Admin legt Admins an |
| `stripe/portal` POST | Jeder Eingeloggte konnte das Kundenportal (Kündigen, Zahlungsart) zu einer beliebigen E-Mail öffnen | nur Admin |
| `lohnabrechnungen/signed-url`, `/send` | Dokument wurde vor der Anmeldeprüfung gelesen (Existenz erkennbar) | erst Anmeldung, dann Lesen |

### Seiten (proxy.ts → lib/seiten-rollen.ts)
Wochenplanung, Kolonnen, Nachunternehmer, Dokumente, Datenimport, GAEB, Gestell-Waage, Einstellungen und
`/admin` waren nur im Menü versteckt, per Adresse aber für jeden Eingeloggten erreichbar. Jetzt gesperrt
mit denselben Rollen wie im Menü. Ein Test gleicht Menü und Sperre ab, damit beides nicht mehr auseinanderläuft.

## In Ordnung befunden
- Alle 131 Routen ohne Login: 401/403, kein Datenbankzugriff (Ausnahmen: bewusst öffentliche Routen mit
  Token, Webhook-Signatur oder Cron-Geheimnis).
- Öffentliche Links: 24 zufällige Bytes (192 Bit), Ablauf und Widerruf werden geprüft.
- Alle 73 Tabellen haben RLS aktiviert. Keine Geheimnisse im Quellcode, keine `NEXT_PUBLIC_`-Geheimnisse.
- Statiker-Logins: nur eigene Seiten und Statiker-Routen.

## Entschieden und umgesetzt (Nachtrag)
1. **Keine Preise für Mitarbeiter und Lager.** `GET /api/projects` (Liste und Einzelprojekt) und die Antwort von `PATCH`
   liefern diesen Rollen nur noch die Aufmaß-Schritte 1–5, die Lidar-Messung, das Entwurf-Flag und das KI-Ergebnis ohne
   Preisfelder (`lib/projekt-sicht.ts`). Sie können außerdem nur noch die Schritte 1–5 speichern, nie Angebot, Stückliste
   oder Preise – damit überschreibt ein gekürztes Projekt beim Speichern keine Preise. Die Seite Aufmaß Schritt 6
   (Angebot mit Preisen) ist für Mitarbeiter gesperrt. Folge: Ein Mitarbeiter kann ein neues Aufmaß nicht mehr selbst
   in Schritt 6 abschließen und anlegen; er arbeitet an bestehenden Projekten (Auto-Speichern der Schritte 1–5).
2. **Kauf ohne Login (`/kaufen`).** `POST /api/stripe/checkout` ist öffentlich, mit Rate-Limit (10 Versuche je IP in 10 Minuten)
   und Längenbegrenzung der Eingaben.
3. **Kundenportal nur für die eigene E-Mail.** `POST /api/stripe/portal`: nur Admin, und die E-Mail muss die Login-Adresse sein
   (fehlt sie im Aufruf, gilt die Login-Adresse). Die Adresse im Stripe-Konto muss also der Login-Adresse des Admins entsprechen.

## Offen (nicht geändert)
1. Die Artikelstammdaten (`inventory`) liefern Mitarbeitern und Lager weiterhin den Artikelpreis (`unit_price`); das Lager braucht
   die Artikel, die Preisspalte ließe sich ausblenden. Gleiches gilt für Lieferscheine.
2. KI-Routen (Plan-Analyse, IFC, Foto, Grundriss) stehen jeder Rolle offen (Kostenrisiko; teils mit Rate-Limit pro Nutzer).
3. `nwd/[id]`: jeder Eingeloggte kann jeden Auftrag ansehen und löschen.
4. In der Datenbank bleiben für Eingeloggte lesbar: alle Mitarbeiter (inkl. Lohnfelder, falls vorhanden),
   Abwesenheiten, Bestände; `site_stock` ist von jedem Eingeloggten änderbar, weil die Server-Aktionen
   in `lib/actions/` den Nutzer-Schlüssel nutzen. Ein späterer Umbau auf den Service-Schlüssel mit Rollenprüfung würde das schließen.
5. Die Seite Rechnungen verlinkt auf `/einstellungen`; für Disposition führt das jetzt zur Startseite.
