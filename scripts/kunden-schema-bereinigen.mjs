// ============================================================
// SCAFFOLD OS – Kunden-Schema aus einem frischen pg_dump erzeugen
//
// Neue Kundeninstanzen bekommen bei der Provisionierung supabase/kunden-schema.sql
// (lib/provision/orchestrate.ts). Dieses Skript erzeugt die Datei neu aus einem
// pg_dump der Master-Instanz und bereinigt ihn wie der bisherige Stand:
//   * entfernt Master-Tabellen (Standard: tenants, subscriptions) samt Policies,
//     Indizes, Constraints und Triggern
//   * entfernt Anweisungen, die der Supabase-SQL-Editor nicht versteht
//     (\restrict / \unrestrict, SET transaction_timeout, search_path-Leerung, CREATE SCHEMA, CREATE EXTENSION)
//   * hängt den Storage-Teil (Policies auf storage.objects, Bucket project-media)
//     aus der bisherigen kunden-schema.sql wieder an
//
// Aufruf im Hauptordner des Repos (der pg_dump liegt zum Beispiel als master-schema-roh.sql dort):
//     node scripts/kunden-schema-bereinigen.mjs master-schema-roh.sql
//     node scripts/kunden-schema-bereinigen.mjs master-schema-roh.sql supabase/kunden-schema.sql --ohne=tenants,subscriptions
//     node scripts/kunden-schema-bereinigen.mjs master-schema-roh.sql supabase/kunden-schema.sql --anhang=supabase/phase-statiker.sql
//
// --anhang=Datei1,Datei2 hängt idempotente SQL-Dateien ans Ende (nach allen Tabellen). Gedacht für Phasen,
// die in der Master-Instanz noch nicht eingespielt sind, aber jede neue Kundeninstanz bekommen soll
// (zum Beispiel phase-statiker.sql: Rolle statiker, project_statiker, is_statiker() und die Sperren no_statiker).
//
// Danach: node scripts/build-kunden-schema.mjs  (erzeugt lib/provision/kunden-schema.ts)
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')));
const pos = args.filter((a) => !a.startsWith('--'));
const roh = pos[0];
const ziel = pos[1] || 'supabase/kunden-schema.sql';
const anhang = (opt.anhang || '').split(',').map((x) => x.trim()).filter(Boolean);
const ohne = (opt.ohne || 'tenants,subscriptions').split(',').map((s) => s.trim()).filter(Boolean);
if (!roh || !fs.existsSync(roh)) {
  console.error('Aufruf: node scripts/kunden-schema-bereinigen.mjs master-schema-roh.sql [supabase/kunden-schema.sql] [--ohne=tenants,subscriptions]');
  process.exit(1);
}
const alt = fs.existsSync(ziel) ? fs.readFileSync(ziel, 'utf8') : '';
const text = fs.readFileSync(roh, 'utf8').replace(/\r\n/g, '\n');

// --- Zeilen entfernen, die im Supabase-SQL-Editor nicht laufen ---
const unerwuenscht = [/^\\(un)?restrict\b.*$/, /^SET transaction_timeout\b.*$/i, /^SELECT pg_catalog\.set_config\('search_path'.*$/i];
const zeilen = text.split('\n').filter((l) => !unerwuenscht.some((r) => r.test(l)));

// --- Blöcke nach pg_dump-Kopfzeilen schneiden ---
const kopf = /^-- (?:Name|Data for Name): (.*?); Type: (.*?); Schema: (.*?); Owner: (.*)$/;
const bloecke = []; let aktuell = { name: null, typ: null, schema: null, zeilen: [] };
for (let i = 0; i < zeilen.length; i++) {
  const m = kopf.exec(zeilen[i]);
  if (m && zeilen[i - 1] === '--' && zeilen[i + 1] === '--') {
    // Rand-Kommentarzeile "--" der Vorgängerzeile gehört zum neuen Block
    if (aktuell.zeilen.length && aktuell.zeilen[aktuell.zeilen.length - 1] === '--') aktuell.zeilen.pop();
    bloecke.push(aktuell);
    aktuell = { name: m[1], typ: m[2], schema: m[3], zeilen: ['--', zeilen[i]] };
  } else aktuell.zeilen.push(zeilen[i]);
}
bloecke.push(aktuell);
const vorspann = bloecke.shift();

const anweisung = (b) => b.zeilen.filter((l) => !/^--/.test(l)).join('\n');
const zielTabelle = (b) => (anweisung(b).match(/public\.([a-z0-9_]+)/) || [])[1] || null; // erste Tabelle der Anweisung = Ziel
const nenntMaster = (b) => ohne.some((t) => new RegExp(`public\\.${t}\\b`).test(anweisung(b)));
const gehoertMaster = (b) => ohne.includes(zielTabelle(b)) || ohne.some((t) => b.name === t || (b.name || '').startsWith(t + ' '));
const entfernt = [], warnungen = [], behalten = [];
for (const b of bloecke) {
  if (['SCHEMA', 'EXTENSION'].includes(b.typ)) { entfernt.push(`${b.typ}: ${b.name}`); continue; }
  if (b.schema === 'storage') continue; // Storage kommt aus dem alten Stand
  if (gehoertMaster(b)) { entfernt.push(`${b.typ}: ${b.name}`); continue; }
  if (nenntMaster(b)) { warnungen.push(`${b.typ}: ${b.name} verweist auf eine Master-Tabelle und wurde ENTFERNT`); entfernt.push(`${b.typ}: ${b.name} (Fremdverweis)`); continue; }
  behalten.push(b);
}

// --- Storage-Teil aus dem alten Stand holen ---
const altZeilen = alt.split('\n'); const altBloecke = []; let cur = null;
for (let i = 0; i < altZeilen.length; i++) {
  const m = kopf.exec(altZeilen[i]);
  if (m && altZeilen[i - 1] === '--' && altZeilen[i + 1] === '--') { if (cur) altBloecke.push(cur); cur = { schema: m[3], zeilen: ['--', altZeilen[i]] }; }
  else if (cur) cur.zeilen.push(altZeilen[i]);
}
if (cur) altBloecke.push(cur);
const bisAnweisungsEnde = (b) => { const out = []; for (const l of b.zeilen) { out.push(l); if (!/^--/.test(l) && /;\s*$/.test(l)) break; } return { ...b, zeilen: out }; };
const storageBloecke = altBloecke.filter((b) => b.schema === 'storage').map(bisAnweisungsEnde);
const bucket = (alt.match(/insert into storage\.buckets[\s\S]*?;/i) || [''])[0];

const heute = new Date().toISOString().slice(0, 10);
const header = `-- ============================================================
-- SCAFFOLD OS – KUNDEN-SCHEMA (PRODUKTIV)
-- ============================================================
-- Echtes Schema, exportiert aus der Master-Instanz (pg_dump
-- --schema-only --no-owner --no-privileges --schema=public) und bereinigt
-- mit scripts/kunden-schema-bereinigen.mjs (Stand ${heute}):
--   * Supabase-Interna (auth, storage-Tabellen, realtime, vault,
--     extensions) nicht enthalten – bringt jede neue Instanz selbst mit
--   * Master-Tabellen (${ohne.join(', ')}) entfernt – die
--     gehoeren NUR in die Master-Datenbank
--   * Storage-Policies + Bucket project-media angehaengt
-- Idempotent gedacht: auf frischer Instanz einmal ausfuehren.
-- ============================================================
`;
const vor = vorspann.zeilen.filter((l) => !/^--/.test(l) || false).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const teile = [header, vor, ...behalten.map((b) => b.zeilen.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()), ...storageBloecke.map((b) => b.zeilen.join('\n').trimEnd())];
if (bucket) teile.push(bucket);
const anhangFehlt = [];
for (const f of anhang) {
  if (!fs.existsSync(f)) { anhangFehlt.push(f); continue; }
  teile.push(`-- ============================================================\n-- ANHANG: ${path.basename(f)}\n-- (idempotent; läuft nach allen Tabellen, damit Schleifen über alle Tabellen auch die neuen erfassen)\n-- ============================================================\n` + fs.readFileSync(f, 'utf8').trim());
}
if (teile.some((t) => /CREATE TABLE (IF NOT EXISTS )?public\.schema_migrationen/i.test(t))) {
  teile.push(`-- Basis-Eintrag im Protokoll: Stand, mit dem diese Instanz angelegt wurde (Basis-Eintrag, damit spätere phase-N-Dateien eindeutig nachvollziehbar sind)\ninsert into public.schema_migrationen (name, bemerkung)\nvalues ('kunden-schema-${heute}', 'Instanz aus supabase/kunden-schema.sql angelegt')\non conflict (name) do nothing;`);
}
fs.writeFileSync(ziel, teile.join('\n\n') + '\n');

const tabellen = (fs.readFileSync(ziel, 'utf8').match(/^CREATE TABLE (?:IF NOT EXISTS )?public\.[a-z0-9_]+/gim) || []).length;
console.log(`Geschrieben: ${ziel}`);
console.log(`Blöcke behalten: ${behalten.length} | entfernt: ${entfernt.length} | Storage-Blöcke aus altem Stand: ${storageBloecke.length} | Bucket-Anweisung: ${bucket ? 'ja' : 'NEIN'}`);
console.log(`Tabellen (CREATE TABLE public.…): ${tabellen}`);
if (entfernt.length) console.log('Entfernt:\n  ' + entfernt.join('\n  '));
if (warnungen.length) console.log('WARNUNG:\n  ' + warnungen.join('\n  '));
if (anhang.length) console.log(`Anhang: ${anhang.filter((f) => !anhangFehlt.includes(f)).join(', ') || 'keiner'}`);
if (anhangFehlt.length) console.log('WARNUNG: Anhang-Datei nicht gefunden: ' + anhangFehlt.join(', '));
if (!bucket || !storageBloecke.length) console.log('WARNUNG: Storage-Teil im alten Stand nicht gefunden – bitte prüfen.');
