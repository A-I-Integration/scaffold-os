// ============================================================
// SCAFFOLD OS – Portal / Vorbau an einer Turmwand erkennen (nur als VORSCHLAG für eine Tür)
//
// Idee: Ein Portalvorbau ist ein niedriger Körper, der direkt an einer Schaftwand sitzt und ein waagrechtes Dach
// (Fläche ≥ 2 m²) in 2 bis 8 m Höhe hat. Gerüstbeläge zählen nicht (sie liegen auf den Gerüstlagen); frei stehende
// Teile (Aufzugsfuß, Podeste) auch nicht, weil sie nicht an der Wand anliegen.
// Das Ergebnis ist eine Näherung aus Geometrie, keine Tür aus dem Modell: Ob dahinter wirklich eine Tür liegt, bestimmt die Person.
// Die Seite folgt aus der Lage zur Längsachse der Teile (Enden = links/rechts, Längsseiten = vorne/hinten, letzteres geraten).
// ============================================================
import type { CadTuer } from '@/lib/calculations/cad-engine'

type Dreieck = number[]

export interface SchaftLage { ang: number; u0: number; u1: number; v0: number; v1: number; laengenAchse: 'u' | 'v'; anbauSeite: 'plus' | 'minus' | null }
export interface ErkanntesPortal {
  seite: CadTuer['side']
  /** Mitte ab Fassadenmitte (m) */
  mitteM: number
  breiteM: number
  hoeheM: number
  /** Vorsprung vor der Wand (m) */
  tiefeM: number
  /** Dachfläche des Vorbaus (m², Summe der waagrechten Teilflächen) */
  flaecheM2: number
}

const MIN_FLAECHE_M2 = 2
const MIN_BREITE_M = 1.5
const MIN_TIEFE_M = 0.4
const MAX_TIEFE_M = 4
const MIN_HOEHE_M = 2
const MAX_HOEHE_M = 8
const WAND_TOL_M = 0.4
const WAAGRECHT_TOL_M = 0.02

const flaecheXY = (t: Dreieck): number => Math.abs((t[3] - t[0]) * (t[7] - t[1]) - (t[4] - t[1]) * (t[6] - t[0])) / 2
const r2 = (x: number): number => Math.round(x * 100) / 100

export function erkennePortale(tris: Dreieck[], lage: SchaftLage, lagenM: number[], tolLageM = 0.12): ErkanntesPortal[] {
  const c = Math.cos(lage.ang), s = Math.sin(lage.ang)
  const { u0, u1, v0, v1 } = lage
  type Gr = { a: number; hs: number; n: number; p0: number; p1: number; t0: number; t1: number }
  const seiten: Record<string, Map<number, Gr>> = { 'u-': new Map(), 'u+': new Map(), 'v-': new Map(), 'v+': new Map() }
  for (const t of tris) {
    if (Math.max(t[2], t[5], t[8]) - Math.min(t[2], t[5], t[8]) > WAAGRECHT_TOL_M) continue
    const h = (t[2] + t[5] + t[8]) / 3
    if (h < MIN_HOEHE_M || h > MAX_HOEHE_M) continue
    if (lagenM.some((l) => Math.abs(l - h) <= tolLageM)) continue
    const us = [0, 3, 6].map((i) => t[i] * c + t[i + 1] * s), vs = [0, 3, 6].map((i) => -t[i] * s + t[i + 1] * c)
    const uMin = Math.min(...us), uMax = Math.max(...us), vMin = Math.min(...vs), vMax = Math.max(...vs)
    const a = flaecheXY(t)
    const eintrag = (key: string, quer0: number, quer1: number, abstandMin: number, abstandMax: number) => {
      const bin = Math.round(h / 0.1)
      const m = seiten[key]
      const g = m.get(bin) ?? { a: 0, hs: 0, n: 0, p0: Infinity, p1: -Infinity, t0: Infinity, t1: -Infinity }
      g.a += a; g.hs += h; g.n++
      g.p0 = Math.min(g.p0, quer0); g.p1 = Math.max(g.p1, quer1)
      g.t0 = Math.min(g.t0, abstandMin); g.t1 = Math.max(g.t1, abstandMax)
      m.set(bin, g)
    }
    // v-Seiten: Dreieck liegt vor der Wand (außerhalb [v0, v1]), über der Wandbreite in u; Abstand = Entfernung von der Wand
    if (uMin >= u0 - WAND_TOL_M && uMax <= u1 + WAND_TOL_M) {
      if (vMax <= v0 + WAND_TOL_M && vMin >= v0 - MAX_TIEFE_M) eintrag('v-', uMin, uMax, v0 - vMax, v0 - vMin)
      if (vMin >= v1 - WAND_TOL_M && vMax <= v1 + MAX_TIEFE_M) eintrag('v+', uMin, uMax, vMin - v1, vMax - v1)
    }
    if (vMin >= v0 - WAND_TOL_M && vMax <= v1 + WAND_TOL_M) {
      if (uMax <= u0 + WAND_TOL_M && uMin >= u0 - MAX_TIEFE_M) eintrag('u-', vMin, vMax, u0 - uMax, u0 - uMin)
      if (uMin >= u1 - WAND_TOL_M && uMax <= u1 + MAX_TIEFE_M) eintrag('u+', vMin, vMax, uMin - u1, uMax - u1)
    }
  }
  const ergebnis: ErkanntesPortal[] = []
  for (const [key, m] of Object.entries(seiten)) {
    // höchste Fläche je Seite nehmen (Dach des Vorbaus)
    let beste: Gr | null = null
    for (const g of m.values()) {
      if (g.a < MIN_FLAECHE_M2 || g.p1 - g.p0 < MIN_BREITE_M) continue
      if (g.t0 > WAND_TOL_M) continue // liegt nicht an der Wand
      if (g.t1 < MIN_TIEFE_M) continue
      if (!beste || g.a > beste.a) beste = g
    }
    if (!beste) continue
    const achse = key[0] as 'u' | 'v', plus = key[1] === '+'
    const quer0 = achse === 'u' ? v0 : u0, quer1 = achse === 'u' ? v1 : u1
    const mitteWand = (quer0 + quer1) / 2
    const portalMitte = (beste.p0 + beste.p1) / 2
    let seite: CadTuer['side']
    if (achse === lage.laengenAchse) seite = plus ? 'right' : 'left'
    else seite = plus ? 'front' : 'back'
    ergebnis.push({ seite, mitteM: r2(portalMitte - mitteWand), breiteM: r2(beste.p1 - beste.p0), hoeheM: r2(beste.hs / beste.n), tiefeM: r2(beste.t1), flaecheM2: r2(beste.a) })
  }
  return ergebnis
}

/** Türvorschlag aus einem Portal (Aufschlag nach innen). */
export function portalAlsTuer(p: ErkanntesPortal, i: number): CadTuer {
  return { id: `portal-${i + 1}`, side: p.seite, offsetAlongM: p.mitteM, widthM: p.breiteM, heightM: p.hoeheM }
}
