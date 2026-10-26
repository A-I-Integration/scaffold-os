// Bündelt die Gebäudeteile-Erkennung (lib/cad) für die Worker:
//   workers/ki/teile.js          (KI-Worker, CAD-Analyse)
//   workers/punktwolke/teile.js  (Punktwolken-Worker, LiDAR-Aufmaß)
// Aufruf: npm run build:worker-teile  (nach jeder Änderung in lib/cad/modell-analyse.ts, baukoerper-erkennung.ts, grundriss-erkennung.ts, lidar-teile.ts)
import { build } from 'esbuild'
const gemeinsam = { bundle: true, platform: 'node', format: 'cjs', target: 'node20', tsconfig: 'tsconfig.json', logLevel: 'info' }
await build({ ...gemeinsam, entryPoints: ['lib/cad/punktwolke-teile.ts'], outfile: 'workers/ki/teile.js',
  banner: { js: '// GENERIERT aus lib/cad/punktwolke-teile.ts – nicht von Hand ändern (npm run build:worker-teile)' } })
await build({ ...gemeinsam, entryPoints: ['lib/cad/lidar-teile.ts'], outfile: 'workers/punktwolke/teile.js',
  banner: { js: '// GENERIERT aus lib/cad/lidar-teile.ts – nicht von Hand ändern (npm run build:worker-teile)' } })
