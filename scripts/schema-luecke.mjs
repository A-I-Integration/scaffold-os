// ============================================================
// SCAFFOLD OS – Schema-Lücke messen (nur lesend, ändert nichts)
//
// Neue Kundeninstanzen bekommen bei der Provisionierung ausschließlich
// supabase/kunden-schema.sql (lib/provision/orchestrate.ts, Schritt "schema").
// Alles, was seitdem als phase-N-Datei dazukam, steht dort nicht drin.
// Dieses Skript vergleicht die übrigen SQL-Dateien mit dem Kunden-Schema und
// listet fehlende Tabellen, Spalten (ADD COLUMN) und Funktionen.
//
// Aufruf im Hauptordner des Repos:
//     node scripts/schema-luecke.mjs
//
// Hinweis: Reine Textsuche. Tabellen, die nur in der Master-Datenbank gebraucht
// werden (z. B. tenants, subscriptions), erscheinen ebenfalls und sind zu
// unterscheiden. Spätere DROP- oder RENAME-Anweisungen werden nicht ausgewertet.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const ksPfad = path.join(root, 'supabase', 'kunden-schema.sql');
if (!fs.existsSync(ksPfad)) {
  console.error('supabase/kunden-schema.sql nicht gefunden – bitte im Hauptordner des Repos starten.');
  process.exit(1);
}
const ks = fs.readFileSync(ksPfad, 'utf8');

const OHNE = new Set(['kunden-schema.sql', 'system-check-migrationen.sql']);
const sqlIn = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.sql')).map((f) => path.join(d, f));
const dateien = [...sqlIn(path.join(root, 'supabase')), ...sqlIn(root)].filter((f) => !OHNE.has(path.basename(f))).sort();

const git = (...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const ersteVersion = (f) => git('log', '--diff-filter=A', '--format=%ad', '--date=short', '--', path.relative(root, f)).split('\n').pop() || 'unbekannt';
const letzterDump = git('log', '-1', '--format=%ad', '--date=short', '--', 'supabase/kunden-schema.sql') || 'unbekannt';

const NAME = '"?([a-z0-9_]+)"?';
const tabRx = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${NAME}`, 'gi');
const alterRx = new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:public\\.)?${NAME}\\s+([^;]*?);`, 'gi');
const addColRx = /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi;
const fnRx = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;

const inKsTabelle = (t) => new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?"?${t}"?\\b`, 'i').test(ks);
const ksTabellenBlock = (t) => (ks.match(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?"?${t}"?\\s*\\(([\\s\\S]*?)\\n\\);`, 'i')) || [])[1] || '';
const ksAlter = [...ks.matchAll(alterRx)].map((m) => ({ t: m[1].toLowerCase(), cols: [...m[2].matchAll(addColRx)].map((x) => x[1].toLowerCase()) }));
const inKsSpalte = (t, c) => new RegExp(`\\b${c}\\b`).test(ksTabellenBlock(t)) || ksAlter.some((a) => a.t === t && a.cols.includes(c));
const inKsFunktion = (n) => new RegExp(`function\\s+(?:public\\.)?"?${n}"?\\s*\\(`, 'i').test(ks);

const add = (map, key, datei) => { (map.get(key) || map.set(key, new Set()).get(key)).add(path.basename(datei)); };
const fehlTab = new Map(), fehlSpalte = new Map(), fehlFkt = new Map(), neuer = [];
for (const f of dateien) {
  const t = fs.readFileSync(f, 'utf8');
  const d = ersteVersion(f);
  if (d !== 'unbekannt' && letzterDump !== 'unbekannt' && d > letzterDump) neuer.push([d, path.basename(f)]);
  for (const m of t.matchAll(tabRx)) { const n = m[1].toLowerCase(); if (!inKsTabelle(n)) add(fehlTab, n, f); }
  for (const m of t.matchAll(alterRx)) {
    const tb = m[1].toLowerCase();
    for (const c of [...m[2].matchAll(addColRx)].map((x) => x[1].toLowerCase())) {
      if (inKsTabelle(tb) && !inKsSpalte(tb, c)) add(fehlSpalte, `${tb}.${c}`, f);
    }
  }
  for (const m of t.matchAll(fnRx)) { const n = m[1].toLowerCase(); if (!inKsFunktion(n)) add(fehlFkt, n, f); }
}

const zeigen = (map) => [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `  ${k}  <-  ${[...v].sort().join(', ')}`).join('\n') || '  keine';
console.log(`Kunden-Schema: letzter Stand ${letzterDump}`);
console.log(`SQL-Dateien (ohne kunden-schema und system-check): ${dateien.length}, davon neuer als der Dump: ${neuer.length}\n`);
console.log(`Tabellen in SQL-Dateien, die im Kunden-Schema FEHLEN: ${fehlTab.size}\n${zeigen(fehlTab)}\n`);
console.log(`Spalten (ADD COLUMN), die im Kunden-Schema FEHLEN: ${fehlSpalte.size}\n${zeigen(fehlSpalte)}\n`);
console.log(`Funktionen, die im Kunden-Schema FEHLEN: ${fehlFkt.size}\n${zeigen(fehlFkt)}\n`);
console.log('Dateien neuer als der Dump:');
for (const [d, n] of neuer.sort()) console.log(`  ${d}  ${n}`);
