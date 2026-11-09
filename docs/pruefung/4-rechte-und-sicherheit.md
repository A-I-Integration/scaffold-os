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

## Offen (nicht geändert, Entscheidung nötig)
1. `projects` GET liefert allen Rollen die kompletten Projektdaten (auch Preise und LV). Einschränken
   erfordert, dass Fahrer-/Mitarbeiter-Seiten nur noch das Nötige bekommen.
2. `stripe/checkout` verlangt Login. Falls `/kaufen` für Neukunden ohne Login gedacht ist, geht der Kauf so nicht.
3. `stripe/portal`: Ein Admin kann die E-Mail frei wählen. Sicherer wäre, sie an die eigene Login-Adresse zu binden;
   das geht nur, wenn die Stripe-Adresse der Login-Adresse entspricht.
4. KI-Routen (Plan-Analyse, IFC, Foto, Grundriss) stehen jeder Rolle offen (Kostenrisiko; teils mit Rate-Limit pro Nutzer).
5. `nwd/[id]`: jeder Eingeloggte kann jeden Auftrag ansehen und löschen.
6. In der Datenbank bleiben für Eingeloggte lesbar: alle Mitarbeiter (inkl. Lohnfelder, falls vorhanden),
   Abwesenheiten, Bestände; `site_stock` ist von jedem Eingeloggten änderbar, weil die Server-Aktionen
   in `lib/actions/` den Nutzer-Schlüssel nutzen. Ein späterer Umbau auf den Service-Schlüssel mit Rollenprüfung würde das schließen.
7. Die Seite Rechnungen verlinkt auf `/einstellungen`; für Disposition führt das jetzt zur Startseite.
