// ============================================================
// SCAFFOLD OS – Fenster und Türen aus einem Vektor-Grundriss lesen.
// Im CAD-Plan sind Öffnungen Lücken in der äußeren Wandschicht (dort liegt dann Fenster-/Türfarbe).
// Wir gehen die Außenkontur entlang, prüfen alle 5 cm, ob dort Wandfarbe liegt, und nehmen Lücken von 0,4 bis 6 m
// als Öffnung. Brüstungs- und Sturzhöhe stehen im Plan als "FPH +0,85 m" / "STUK +2,10 m" neben dem Fenster.
// ============================================================

import type { VektorFlaeche } from './pdf-vektoren'
import type { GefundenerGrundriss, PlanText } from './grundriss-finden'

export interface PlanOeffnung {
  /** Mitte der Öffnung in Seiten-Punkten */
  x: number
  y: number
  breiteM: number
  /** Brüstungshöhe (FPH) und Sturzunterkante (STUK) in Metern über dem Geschossboden, wenn im Plan beschriftet */
  bruestungM?: number
  sturzM?: number
  typ: 'tuer' | 'fenster'
}

const SCHRITT_M = 0.05
const MIN_BREITE_M = 0.4
const MAX_BREITE_M = 6
const ECKE_M = 0.2

type Ring = number[][]
const inRing = (ring: Ring, px: number, py: number) => {
  let inn = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inn = !inn
  }
  return inn
}

function kote(s: string, kuerzel: string): number | null {
  const m = s.trim().match(new RegExp(`^${kuerzel}\\s*([+±-]?)\\s*(\\d{1,2}),(\\d{2})\\s*m?$`, 'i'))
  if (!m) return null
  const v = (parseInt(m[2], 10) * 100 + parseInt(m[3], 10)) / 100
  return m[1] === '-' ? -v : v
}

/** Fenster und Türen im Grundriss `g`. Leer, wenn die Wand nicht als zusammenhängende Farbfläche vorliegt. */
export function oeffnungenFinden(fl: VektorFlaeche[], g: GefundenerGrundriss, texte: PlanText[], meterJePunkt: number): PlanOeffnung[] {
  if (!(meterJePunkt > 0) || g.kontur.length < 3) return []
  const pt = (m: number) => m / meterJePunkt
  const xs = g.kontur.map((p) => p.x), ys = g.kontur.map((p) => p.y)
  const x0 = Math.min(...xs) - pt(0.5), x1 = Math.max(...xs) + pt(0.5), y0 = Math.min(...ys) - pt(0.5), y1 = Math.max(...ys) + pt(0.5)
  const ringe: { ring: Ring; b: [number, number, number, number] }[] = []
  for (const f of fl) {
    if (f.linie || f.fill !== g.farbe) continue
    for (const r of f.ringe) {
      const rx = r.map((p) => p[0]), ry = r.map((p) => p[1])
      const b: [number, number, number, number] = [Math.min(...rx), Math.min(...ry), Math.max(...rx), Math.max(...ry)]
      if (b[0] >= x0 && b[2] <= x1 && b[1] >= y0 && b[3] <= y1) ringe.push({ ring: r, b })
    }
  }
  if (!ringe.length) return []
  const bedeckt = (x: number, y: number) => ringe.some((e) => x >= e.b[0] && x <= e.b[2] && y >= e.b[1] && y <= e.b[3] && inRing(e.ring, x, y))
  const innen = (x: number, y: number) => inRing(g.kontur.map((p) => [p.x, p.y]), x, y)

  const gefunden: PlanOeffnung[] = []
  const n = g.kontur.length
  for (let i = 0; i < n; i++) {
    const a = g.kontur[i], b = g.kontur[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const lenM = len * meterJePunkt
    if (lenM < MIN_BREITE_M + 2 * ECKE_M) continue
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len
    // Normale nach innen: dorthin, wo ein Probepunkt in der Kontur liegt
    let nx = -uy, ny = ux
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    if (!innen(mx + nx * pt(0.1), my + ny * pt(0.1))) { nx = -nx; ny = -ny }
    const schritte = Math.floor(lenM / SCHRITT_M)
    let luecke: number | null = null
    const abschluss = (von: number, bis: number) => {
      const breite = (bis - von) * SCHRITT_M
      if (breite < MIN_BREITE_M || breite > MAX_BREITE_M) return
      const t = ((von + bis) / 2) * SCHRITT_M / meterJePunkt
      gefunden.push({ x: a.x + ux * t, y: a.y + uy * t, breiteM: Math.round(breite * 100) / 100, typ: 'fenster' })
    }
    for (let s = 0; s <= schritte; s++) {
      const t = (s * SCHRITT_M) / meterJePunkt
      const abstandEcke = Math.min(s * SCHRITT_M, lenM - s * SCHRITT_M)
      const px = a.x + ux * t, py = a.y + uy * t
      const wand = abstandEcke < ECKE_M || bedeckt(px + nx * pt(0.06), py + ny * pt(0.06)) || bedeckt(px + nx * pt(0.12), py + ny * pt(0.12))
      if (!wand) { if (luecke === null) luecke = s } else if (luecke !== null) { abschluss(luecke, s); luecke = null }
    }
    if (luecke !== null) abschluss(luecke, schritte)
  }

  // Beschriftungen "FPH +0,85 m" (Brüstung) und "STUK +2,10 m" (Sturz) der nächsten Öffnung zuordnen (nur im Umkreis von 2,5 m)
  const nah = pt(2.5)
  for (const o of gefunden) {
    let bf: { d: number; v: number } | null = null, bs: { d: number; v: number } | null = null
    for (const t of texte) {
      const d = Math.hypot(t.x - o.x, t.y - o.y)
      if (d > nah) continue
      const f = kote(t.s, 'FPH'), s = kote(t.s, 'STUK')
      if (f !== null && (!bf || d < bf.d)) bf = { d, v: f }
      if (s !== null && (!bs || d < bs.d)) bs = { d, v: s }
    }
    if (bf) o.bruestungM = bf.v
    if (bs) o.sturzM = bs.v
    // Unterkante am Boden (≤ 0,15 m) und mindestens 1,7 m hoch: Tür
    if (o.bruestungM !== undefined && o.sturzM !== undefined && o.bruestungM <= 0.15 && o.sturzM - o.bruestungM >= 1.7) o.typ = 'tuer'
  }
  return gefunden
}
