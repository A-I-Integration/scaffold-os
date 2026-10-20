// Schreibt die drei synthetischen Test-IFCs (bekannte Maße) nach lib/cad/__tests__/fixtures/ifc/.
// Aufruf: npm run ifc:testmodelle
// Quelle der Maße: lib/cad/ifc-testmodelle.ts (die Tests rufen die Funktionen direkt auf; die Dateien sind zum Ausprobieren
// im Upload und zum Öffnen in einem IFC-Viewer).
import { build } from 'esbuild'
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const tmp = mkdtempSync(join(tmpdir(), 'ifc-testmodelle-'))
const out = join(tmp, 'ifc-testmodelle.mjs')
await build({ entryPoints: ['lib/cad/ifc-testmodelle.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' })
const m = await import(pathToFileURL(out).href)
const ziel = 'lib/cad/__tests__/fixtures/ifc'
mkdirSync(ziel, { recursive: true })
const dateien = {
  'haus-2-geschosse.ifc': m.hausZweiGeschosse(),
  'l-form.ifc': m.lFormHaus(),
  'haus-mit-anbau.ifc': m.hausMitAnbau(),
}
for (const [name, text] of Object.entries(dateien)) { writeFileSync(join(ziel, name), text); console.log('geschrieben:', join(ziel, name), `(${text.length} Zeichen)`) }
