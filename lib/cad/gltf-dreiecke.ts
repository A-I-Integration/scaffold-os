// ============================================================
// SCAFFOLD OS – glTF/GLB → Dreiecks-Suppe (Brücke zum bestehenden OBJ/STL-Weg)
//
// Liest eine glTF-/GLB-Datei mit dem GLTFLoader von three.js, setzt alle Netze in Weltkoordinaten (Knoten-Transformationen
// eingerechnet) und liefert die Dreiecke als Float32Array (x,y,z je Ecke, 9 Werte pro Dreieck) – genau das, was
// `analysiereDreiecke` von OBJ/STL bekommt. Es gibt keinen eigenen Erkennungs-Code für glTF.
// glTF ist per Definition Y oben und Meter.
// Ist die Datei defekt oder enthält keine Dreiecke, kommt eine ehrliche Meldung – es wird nie etwas halb übernommen
// (gleiches Muster wie der IFC-Einleser).
// ============================================================
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Mesh, Vector3, type BufferGeometry, type Object3D } from 'three'

export const GLTF_MAX_DREIECKE = 20_000_000

export type GltfErgebnis =
  | { ok: true; dreiecke: Float32Array; anzahl: number }
  | { ok: false; grund: 'defekt' | 'leer' | 'zu-gross'; meldung: string }

const ZUSATZ = 'Bitte die Datei als IFC oder OBJ exportieren.'

export function dreieckeAusSzene(wurzel: Object3D): GltfErgebnis {
  wurzel.updateMatrixWorld(true)
  const teile: Float32Array[] = []
  let anzahl = 0
  const p = new Vector3()
  let kaputt = false
  wurzel.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh || !m.geometry) return
    const g = m.geometry as BufferGeometry
    const pos = g.getAttribute('position')
    if (!pos || pos.itemSize < 3) return
    const index = g.getIndex()
    const ecken = index ? index.count : pos.count
    const n = Math.floor(ecken / 3)
    if (n === 0) return
    anzahl += n
    if (anzahl > GLTF_MAX_DREIECKE) return
    const aus = new Float32Array(n * 9)
    for (let i = 0; i < n * 3; i++) {
      const vi = index ? index.getX(i) : i
      if (vi >= pos.count) { kaputt = true; return }
      p.fromBufferAttribute(pos, vi).applyMatrix4(m.matrixWorld)
      aus[i * 3] = p.x; aus[i * 3 + 1] = p.y; aus[i * 3 + 2] = p.z
    }
    teile.push(aus)
  })
  if (anzahl > GLTF_MAX_DREIECKE) return { ok: false, grund: 'zu-gross', meldung: `Das Modell hat mehr als ${GLTF_MAX_DREIECKE / 1e6} Mio. Dreiecke und ist zu groß für den Import. ${ZUSATZ}` }
  if (kaputt) return { ok: false, grund: 'defekt', meldung: `Die konvertierte Datei ist beschädigt (ungültige Verweise auf Eckpunkte). ${ZUSATZ}` }
  if (anzahl === 0) return { ok: false, grund: 'leer', meldung: `In der konvertierten Datei sind keine Flächen enthalten. ${ZUSATZ}` }
  const dreiecke = new Float32Array(anzahl * 9)
  let o = 0
  for (const t of teile) { dreiecke.set(t, o); o += t.length }
  for (let i = 0; i < dreiecke.length; i++) {
    if (!Number.isFinite(dreiecke[i])) return { ok: false, grund: 'defekt', meldung: `Die konvertierte Datei enthält ungültige Koordinaten. ${ZUSATZ}` }
  }
  return { ok: true, dreiecke, anzahl }
}

export function dreieckeAusGltf(daten: ArrayBuffer | string): Promise<GltfErgebnis> {
  return new Promise((resolve) => {
    try {
      new GLTFLoader().parse(daten, '', (gltf) => {
        try { resolve(dreieckeAusSzene(gltf.scene)) } catch (e) { resolve({ ok: false, grund: 'defekt', meldung: `Die konvertierte Datei konnte nicht gelesen werden (${(e as Error).message}). ${ZUSATZ}` }) }
      }, (err) => {
        const text = (err as unknown as { message?: string })?.message
        resolve({ ok: false, grund: 'defekt', meldung: `Die konvertierte Datei ist beschädigt oder unvollständig${text ? ` (${text})` : ''}. ${ZUSATZ}` })
      })
    } catch (e) {
      resolve({ ok: false, grund: 'defekt', meldung: `Die konvertierte Datei konnte nicht gelesen werden (${(e as Error).message}). ${ZUSATZ}` })
    }
  })
}
