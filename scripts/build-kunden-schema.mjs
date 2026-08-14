// ============================================================
// SCAFFOLD OS – Kunden-Setup-Paket
// Erzeugt lib/provision/kunden-schema.ts aus supabase/kunden-schema.sql
//
// Läuft automatisch vor jedem Build (npm-Lifecycle „prebuild"),
// kann aber auch manuell gestartet werden:
//     node scripts/build-kunden-schema.mjs
//
// Warum als TS-Modul? Damit steht das Schema zur Laufzeit garantiert
// im Serverless-Bundle – unabhängig vom File-Tracing auf Vercel.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'supabase', 'kunden-schema.sql');
const out = path.join(root, 'lib', 'provision', 'kunden-schema.ts');

if (!fs.existsSync(src)) {
  if (fs.existsSync(out)) {
    console.log('[kunden-schema] supabase/kunden-schema.sql fehlt – behalte bestehende kunden-schema.ts');
    process.exit(0);
  }
  console.error('[kunden-schema] FEHLER: supabase/kunden-schema.sql nicht gefunden.');
  process.exit(1);
}

const sql = fs.readFileSync(src, 'utf8');
const banner =
  '// GENERIERT aus supabase/kunden-schema.sql – NICHT von Hand ändern!\n' +
  '// Erzeugt von scripts/build-kunden-schema.mjs (prebuild-Schritt).\n';

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, banner + 'export const KUNDEN_SCHEMA = ' + JSON.stringify(sql) + ';\n');

if (sql.includes('PLACEHOLDER_NICHT_PRODUKTIV')) {
  console.warn('[kunden-schema] WARNUNG: kunden-schema.sql ist noch der PLATZHALTER.');
  console.warn('[kunden-schema] Die Provisionierung verweigert den Lauf, bis das echte Schema eingefügt ist.');
} else {
  console.log(`[kunden-schema] OK – ${sql.length} Zeichen nach lib/provision/kunden-schema.ts geschrieben.`);
}
