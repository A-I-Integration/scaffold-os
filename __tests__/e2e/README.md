# Faktura End-to-End-Test (echte PostgreSQL)

Prüft die kaufmännische Kette einer Gerüstbaustelle durch die ECHTEN Routen und die ECHTEN SQL-Funktionen:
Auftrag/Nachtrag → kumuliertes Aufmaß → Abschläge → Vorhaltung (Teilabbau, Preisart, Preisstufe) → Schlussrechnung → Versand/Protokoll →
Storno/Gutschrift → Zahlung → Parallelität (mehrere Datenbankverbindungen gleichzeitig).

**Echt:** PostgreSQL + alle Migrationen aus `supabase/`, die Routen `/api/invoices`, `/api/projects`, `/api/nachtraege`, `/api/email`, `/api/invoice-dispatches`.
**Nachgebaut:** nur die HTTP-Schicht von PostgREST (`pg-rest.ts`), die Anmeldung (Admin) und Resend (kein echter Versand).
Der Test läuft nur mit `E2E_DATABASE_URL`; ohne diese Variable wird er übersprungen (normaler `npm test` ist unberührt).

## Einrichten (eigene Test-Datenbank, NIE Produktion)

```bash
docker run -d --name scaffold-e2e -e POSTGRES_PASSWORD=postgres -p 54330:5432 postgres:16
export E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:54330/postgres"
bash __tests__/e2e/setup-db.sh
E2E_BERICHT=/tmp/faktura-e2e-bericht.json npx vitest run __tests__/e2e
```

`setup-db.sh` löscht das Schema `public` der angegebenen Datenbank und bricht bei Supabase-Adressen ab.
Aufräumen: Der Test löscht seine Testdaten (Projekte „E2E …“) selbst; am einfachsten danach `docker rm -f scaffold-e2e`.
Der Änderungsverlauf ist per Trigger nur zum Anhängen da; das Aufräumen der Test-Datenbank schaltet dafür die Trigger in genau einer Sitzung ab (Superuser nötig).

Tests mit `[OFFEN-n]` im Namen dokumentieren bekannte, noch nicht behobene Befunde und sind bis zur Entscheidung rot.
