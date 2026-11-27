// Kopiert die Dateien der Texterkennung (Tesseract) nach public/tesseract, damit sie von der eigenen Seite geladen werden
// und beim Auslesen von Rechnungen nichts von einem fremden Server nachgeladen wird. Läuft vor dev und build.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ziel = join('public', 'tesseract')
mkdirSync(join(ziel, 'lang'), { recursive: true })
const dateien = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz', 'lang/deu.traineddata.gz'],
]
let fehlt = 0
for (const [von, nach] of dateien) {
  if (!existsSync(von)) { console.warn('Texterkennung: Datei fehlt, übersprungen:', von); fehlt++; continue }
  copyFileSync(von, join(ziel, nach))
}
console.log(fehlt ? `Texterkennung: ${fehlt} Datei(en) fehlen (npm install ausführen).` : 'Texterkennung nach public/tesseract kopiert.')
