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

export type GltfDachForm = 'flachdach' | 'satteldach' | 'walmdach' | 'pultdach' | 'mansardendach' | 'kein'

/** Exakte CAD-Maße aus den Metadaten einer GLB (falls der Export sie enthält). Diese Werte schlagen die grobe Sichtbox. */
export interface GltfGebaeudeMasse {
  lengthM: number
  widthM: number
  heightM: number
  eavesHeightM?: number
  roofHeightM?: number
  roofForm?: GltfDachForm
}

export type GltfErgebnis =
  | { ok: true; dreiecke: Float32Array; anzahl: number; gebaeude?: GltfGebaeudeMasse }
  | { ok: false; grund: 'defekt' | 'leer' | 'zu-gross'; meldung: string }

const ZUSATZ = 'Bitte die Datei als IFC oder OBJ exportieren.'
const DACH_FORMEN = new Set<GltfDachForm>(['flachdach', 'satteldach', 'walmdach', 'pultdach', 'mansardendach', 'kein'])

function zahlAus(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function grundflaecheAus(v: unknown): { lengthM: number; widthM: number } | null {
  if (typeof v !== 'string') return null
  const m = /(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)/i.exec(v)
  if (!m) return null
  const a = zahlAus(m[1]), b = zahlAus(m[2])
  return a !== null && b !== null ? { lengthM: a, widthM: b } : null
}

/** Liest belegte Maße aus glTF-Extras/userData. Unvollständige oder widersprüchliche Angaben werden verworfen. */
export function gebaeudeMasseAusUserData(daten: Record<string, unknown>): GltfGebaeudeMasse | null {
  const grund = grundflaecheAus(daten.Grundflaeche_m ?? daten.grundflaeche_m)
  const lengthM = zahlAus(daten.Gebaeudelaenge_m ?? daten.Laenge_m ?? daten.laenge_m) ?? grund?.lengthM
  const widthM = zahlAus(daten.Gebaeudebreite_m ?? daten.Breite_m ?? daten.breite_m) ?? grund?.widthM
  const heightM = zahlAus(daten.Firsthoehe_m ?? daten.Gesamthoehe_m ?? daten.Gebaeudehoehe_m ?? daten.Hoehe_m)
  const eavesHeightM = zahlAus(daten.Traufhoehe_m ?? daten.traufhoehe_m)
  if (lengthM == null || widthM == null || heightM === null) return null
  if (!(lengthM > 0 && widthM > 0 && heightM > 0)) return null
  if (!(lengthM <= 300 && widthM <= 200 && heightM <= 150)) return null
  if (eavesHeightM !== null && (!(eavesHeightM > 0) || eavesHeightM > heightM)) return null
  const dachVonForm = typeof daten.Dachform === 'string' ? daten.Dachform.trim().toLowerCase() : null
  const roofForm = dachVonForm && DACH_FORMEN.has(dachVonForm as GltfDachForm) ? dachVonForm as GltfDachForm : undefined
  const roofHeightM = zahlAus(daten.Dachhoehe_m ?? daten.dachhoehe_m) ?? (eavesHeightM !== null ? Math.max(0, heightM - eavesHeightM) : undefined)
  return {
    lengthM: Math.round(lengthM * 100) / 100,
    widthM: Math.round(widthM * 100) / 100,
    heightM: Math.round(heightM * 100) / 100,
    ...(eavesHeightM !== null ? { eavesHeightM: Math.round(eavesHeightM * 100) / 100 } : {}),
    ...(roofHeightM !== undefined ? { roofHeightM: Math.round(roofHeightM * 100) / 100 } : {}),
    ...(roofForm ? { roofForm } : {}),
  }
}

function gebaeudeMasseAusSzene(wurzel: Object3D): GltfGebaeudeMasse | undefined {
  let gefunden: GltfGebaeudeMasse | undefined
  wurzel.traverse((o) => {
    if (gefunden || !o.userData) return
    gefunden = gebaeudeMasseAusUserData(o.userData as Record<string, unknown>) ?? undefined
  })
  return gefunden
}


/** ausschliessen: Namen von Knoten (samt allem darunter), die nicht mitgezählt werden, z. B. ein mitgeliefertes Gerüst. */
export function dreieckeAusSzene(wurzel: Object3D, ausschliessen?: (name: string) => boolean): GltfErgebnis {
  wurzel.updateMatrixWorld(true)
  const teile: Float32Array[] = []
  let anzahl = 0
  const p = new Vector3()
  let kaputt = false
  wurzel.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh || !m.geometry) return
    if (ausschliessen) { for (let k: Object3D | null = o; k; k = k.parent) { if (k.name && ausschliessen(k.name)) return } }
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
  const gebaeude = gebaeudeMasseAusSzene(wurzel)
  return { ok: true, dreiecke, anzahl, ...(gebaeude ? { gebaeude } : {}) }
}

export function dreieckeAusGltf(daten: ArrayBuffer | string, ausschliessen?: (name: string) => boolean): Promise<GltfErgebnis> {
  return new Promise((resolve) => {
    try {
      new GLTFLoader().parse(daten, '', (gltf) => {
        try { resolve(dreieckeAusSzene(gltf.scene, ausschliessen)) } catch (e) { resolve({ ok: false, grund: 'defekt', meldung: `Die konvertierte Datei konnte nicht gelesen werden (${(e as Error).message}). ${ZUSATZ}` }) }
      }, (err) => {
        const text = (err as unknown as { message?: string })?.message
        resolve({ ok: false, grund: 'defekt', meldung: `Die konvertierte Datei ist beschädigt oder unvollständig${text ? ` (${text})` : ''}. ${ZUSATZ}` })
      })
    } catch (e) {
      resolve({ ok: false, grund: 'defekt', meldung: `Die konvertierte Datei konnte nicht gelesen werden (${(e as Error).message}). ${ZUSATZ}` })
    }
  })
}
