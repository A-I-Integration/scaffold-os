// Bündelt die Gebäudeteile-Erkennung (lib/cad) für den KI-Worker zu workers/ki/teile.js.
// Aufruf: npm run build:worker-teile  (nach jeder Änderung in lib/cad/modell-analyse.ts, baukoerper-erkennung.ts, grundriss-erkennung.ts)
import { build } from 'esbuild'
await build({
  entryPoints: ['lib/cad/punktwolke-teile.ts'],
  bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  outfile: 'workers/ki/teile.js', tsconfig: 'tsconfig.json',
  banner: { js: '// GENERIERT aus lib/cad/punktwolke-teile.ts – nicht von Hand ändern (npm run build:worker-teile)' },
  logLevel: 'info',
})
