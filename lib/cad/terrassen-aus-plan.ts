// ============================================================
// SCAFFOLD OS – Terrassen und Balkone aus dem Grundriss: Beschriftung („Terrasse“, „Balkon“, „Loggia“) + kleinste umschließende
// Zonenfläche. Nur rechteckige Flächen (Füllgrad ≥ 90 %) von 2 bis 60 m² und mindestens 1 m Seitenlänge, die an ein Geschoss grenzen
// (höchstens 1,5 m vom Rahmen der Geschosskontur entfernt). Sammelzonen und freie Flächen werden nicht geraten, sondern übergangen.
// ============================================================
import type { VektorFlaeche } from './pdf-vektoren'
import type { PlanText } from './grundriss-finden'

export interface PlanTerrasse {
  /** Geschoss, an das die Terrasse grenzt (Ebene wie im Plan, EG = 0) */
  ebene: number
  titel: string
  /** Mitte und Ausdehnung in Metern in der Plan-Basis (x nach rechts, z nach unten im Plan) */
  x: number
  z: number
  laengeM: number
  tiefeM: number
}

export interface TerrassenGeschoss { ebene: number; bbox: [number, number, number, number] }

const MIN_M2 = 2, MAX_M2 = 60, MIN_SEITE_M = 1, MAX_ABSTAND_M = 1.5, MIN_FUELLGRAD = 0.9
const WORT = /terrasse|balkon|loggia/i

const inRing = (ring: number[][], px: number, py: number) => {
  let inn = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inn = !inn
  }
  return inn
}
const ringFlaeche = (r: number[][]) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 } return Math.abs(a) / 2 }
const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * @param geschosse Rahmen der Geschosskonturen in Seiten-Punkten (Ebene ≥ 0)
 * @param mitte Ursprung der Plan-Basis in Seiten-Punkten (wie bei den Geschosskonturen)
 */
export function terrassenFinden(flaechen: VektorFlaeche[], texte: PlanText[], geschosse: TerrassenGeschoss[], meterJePunkt: number, mitte: { x: number; y: number }): PlanTerrasse[] {
  if (!(meterJePunkt > 0) || !geschosse.length) return []
  const out: PlanTerrasse[] = []
  const gesehen = new Set<string>()
  const maxAbstandPt = MAX_ABSTAND_M / meterJePunkt
  for (const t of texte) {
    if (!WORT.test(t.s) || /gel(ä|ae)nder/i.test(t.s)) continue
    let best: { f: VektorFlaeche; r: number[][]; m2: number } | null = null
    for (const f of flaechen) {
      if (f.linie) continue
      const b = f.bbox
      if (!(b[0] <= t.x && t.x <= b[2] && b[1] <= t.y && t.y <= b[3])) continue
      const w = (b[2] - b[0]) * meterJePunkt, h = (b[3] - b[1]) * meterJePunkt
      if (w < MIN_SEITE_M || h < MIN_SEITE_M || w * h < MIN_M2 || w * h > MAX_M2) continue
      for (const r of f.ringe) {
        if (r.length < 3 || !inRing(r, t.x, t.y)) continue
        if (ringFlaeche(r) / ((b[2] - b[0]) * (b[3] - b[1])) < MIN_FUELLGRAD) continue
        if (!best || w * h < best.m2) best = { f, r, m2: w * h }
      }
    }
    if (!best) continue
    const b = best.f.bbox
    // an welches Geschoss grenzt die Fläche? (Abstand der Rahmen, 0 bei Überlappung)
    let nah: { g: TerrassenGeschoss; d: number } | null = null
    for (const g of geschosse) {
      const dx = Math.max(0, g.bbox[0] - b[2], b[0] - g.bbox[2]), dy = Math.max(0, g.bbox[1] - b[3], b[1] - g.bbox[3])
      const d = Math.hypot(dx, dy)
      if (!nah || d < nah.d) nah = { g, d }
    }
    if (!nah || nah.d > maxAbstandPt) continue
    const schluessel = `${nah.g.ebene}|${b.map((v) => Math.round(v)).join(',')}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    out.push({
      ebene: nah.g.ebene, titel: t.s.trim(),
      x: r2(((b[0] + b[2]) / 2 - mitte.x) * meterJePunkt), z: r2(((b[1] + b[3]) / 2 - mitte.y) * meterJePunkt),
      laengeM: r2((b[2] - b[0]) * meterJePunkt), tiefeM: r2((b[3] - b[1]) * meterJePunkt),
    })
  }
  return out
}
