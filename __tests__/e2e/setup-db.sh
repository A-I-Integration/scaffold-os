#!/bin/bash
# Richtet die Test-Datenbank für den Faktura-End-to-End-Test ein: Stub-Schema + ALLE SQL-Migrationen aus supabase/ in Versionsreihenfolge.
# Aufruf:  E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:54330/postgres bash __tests__/e2e/setup-db.sh
# ACHTUNG: löscht das Schema "public" der angegebenen Datenbank. NIE auf Produktion oder Staging mit echten Daten ausführen.
set -u
: "${E2E_DATABASE_URL:?E2E_DATABASE_URL fehlt}"
case "$E2E_DATABASE_URL" in *supabase.co*|*supabase.com*) echo "Abbruch: das sieht nach einer echten Supabase-Datenbank aus."; exit 1;; esac
cd "$(dirname "$0")/../.."
psql "$E2E_DATABASE_URL" -q -f __tests__/e2e/stub-schema.sql 2>&1 | grep -E "ERROR" 
for f in $(ls supabase/phase-*.sql supabase/migration-*.sql supabase/kunden-schema.sql | sort -V); do
  case "$f" in *diagnose*|*system-check*|*nachhole*) continue;; esac
  psql "$E2E_DATABASE_URL" -q -f "$f" 2>&1 | grep -E "ERROR" | head -1 | sed "s#^#$f: #"
done
echo "Fertig. Erwartet werden höchstens Meldungen zu kunden-schema.sql (customers existiert) und phase-rechnung-anhaenge.sql (Storage-Spalte)."
