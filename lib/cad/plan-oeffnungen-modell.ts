// ============================================================
// SCAFFOLD OS – Fenster und Türen aus dem Plan an ihre Stelle im 3D-Modell setzen.
// Im Plan liegen die Öffnungen als Punkte (Seiten-Punkte) auf der Außenkontur. Das Modell kennt je Fassadenseite
// (vorne/hinten/links/rechts) einen Abstand ab Fassadenmitte. Hier wird beides verbunden:
//  1. jede Öffnung der Kante des Hauptkörper-Rechtecks zuordnen, an der sie liegt (Öffnungen an Vorbauten gehören nicht dazu),
//  2. die Vorderseite wählen (die lange Kante mit den meisten Öffnungen, Türen zählen doppelt) und den Plan so drehen, dass diese Seite vorne liegt.
// ============================================================

import type { CadFenster, CadTuer, CadVorbau } from '@/lib/calculations/cad-engine'
import type { Rechteck, Vorbau } from './hauptkoerper'
import type { PlanOeffnung } from './oeffnungen-aus-plan'

export type PlanKante = 'unten' | 'oben' | 'links' | 'rechts'

/** Öffnung an einer Kante des Hauptkörpers. alongM: ab Kantenmitte in Plan-Richtung (x nach rechts bzw. y nach unten). */
export interface PlanOeffnungAnKante {
  typ: 'tuer' | 'fenster'
  kante: PlanKante
  alongM: number
  breiteM: number
  /** Brüstung (FPH) und Sturzunterkante (STUK) über dem Geschossboden, wenn im Plan beschriftet */
  bruestungM?: number
  sturzM?: number
}

const MAX_ABSTAND_M = 0.25
const r2 = (v: number) => Math.round(v * 100) / 100

/** Weist Öffnungen der Kante zu, an der sie liegen. `abseits` zählt Öffnungen, die an keiner Kante des Rechtecks liegen (z. B. an einem Vorbau). */
export function oeffnungenAnKanten(o: PlanOeffnung[], r: Rechteck, meterJePunkt: number): { an: PlanOeffnungAnKante[]; abseits: number } {
  const an: PlanOeffnungAnKante[] = []
  let abseits = 0
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2
  const tol = MAX_ABSTAND_M / meterJePunkt
  for (const p of o) {
    const inX = p.x >= r.x0 - tol && p.x <= r.x1 + tol, inY = p.y >= r.y0 - tol && p.y <= r.y1 + tol
    const kandidaten: { k: PlanKante; d: number }[] = []
    if (inX) { kandidaten.push({ k: 'unten', d: Math.abs(p.y - r.y1) }, { k: 'oben', d: Math.abs(p.y - r.y0) }) }
    if (inY) { kandidaten.push({ k: 'links', d: Math.abs(p.x - r.x0) }, { k: 'rechts', d: Math.abs(p.x - r.x1) }) }
    kandidaten.sort((a, b) => a.d - b.d)
    const best = kandidaten[0]
    if (!best || best.d > tol) { abseits++; continue }
    const along = (best.k === 'unten' || best.k === 'oben' ? p.x - cx : p.y - cy) * meterJePunkt
    an.push({
      typ: p.typ, kante: best.k, alongM: r2(along), breiteM: p.breiteM,
      ...(p.bruestungM !== undefined ? { bruestungM: p.bruestungM } : {}),
      ...(p.sturzM !== undefined ? { sturzM: p.sturzM } : {}),
    })
  }
  return { an, abseits }
}

export interface PlanGeschossOeffnungen { ebene: number; oeffnungen: PlanOeffnungAnKante[] }

export interface ModellOeffnungen {
  tueren: CadTuer[]
  fenster: CadFenster[]
  /** Welche Plan-Kante im Modell vorne liegt (bei Blick auf den Plan: unten = Südseite) */
  vorderseite: PlanKante
}

// Plan-Koordinaten: x nach rechts, y nach unten. Außennormale je Kante.
const NORMALE: Record<PlanKante, [number, number]> = { unten: [0, 1], oben: [0, -1], links: [-1, 0], rechts: [1, 0] }

/**
 * Plan-Öffnungen in Modell-Öffnungen umsetzen.
 * `langeAchse` = Richtung der längeren Hauptkörper-Seite im Plan ('x' = waagerecht); vorne/hinten sind die langen Kanten.
 * `geschossHoeheM` bestimmt die Höhe, auf der die Obergeschosse beginnen.
 */
export function oeffnungenFuerModell(geschosse: PlanGeschossOeffnungen[], langeAchse: 'x' | 'y', geschossHoeheM: number): ModellOeffnungen | null {
  const alle = geschosse.filter((g) => g.ebene >= 0).flatMap((g) => g.oeffnungen.map((o) => ({ ...o, ebene: g.ebene })))
  if (!alle.length) return null
  const lange: PlanKante[] = langeAchse === 'x' ? ['unten', 'oben'] : ['links', 'rechts']
  // Vorderseite: lange Kante mit den meisten Öffnungen, Türen doppelt gewichtet (dort ist der Eingang); bei Gleichstand unten bzw. links
  const anzahl = (k: PlanKante) => alle.filter((o) => o.kante === k).reduce((a, o) => a + (o.typ === 'tuer' ? 2 : 1), 0)
  const vorne: PlanKante = anzahl(lange[1]) > anzahl(lange[0]) ? lange[1] : lange[0]
  const n = NORMALE[vorne]
  const xhat: [number, number] = [n[1], -n[0]] // "rechts" für den Betrachter, der von außen auf die Vorderseite schaut

  const tueren: CadTuer[] = []
  const fenster: CadFenster[] = []
  let nr = 0
  for (const o of alle) {
    const w = NORMALE[o.kante]
    const dotN = w[0] * n[0] + w[1] * n[1], dotX = w[0] * xhat[0] + w[1] * xhat[1]
    const side: 'front' | 'back' | 'left' | 'right' = dotN === 1 ? 'front' : dotN === -1 ? 'back' : dotX === 1 ? 'right' : 'left'
    // Lage entlang der Wand: Plan-Richtung der Kante auf die Modell-Richtung (x bzw. z) übertragen
    const richtung: [number, number] = o.kante === 'unten' || o.kante === 'oben' ? [1, 0] : [0, 1]
    const entlang = side === 'front' || side === 'back'
      ? richtung[0] * xhat[0] + richtung[1] * xhat[1]
      : richtung[0] * n[0] + richtung[1] * n[1]
    const offset = r2(o.alongM * entlang)
    const basis = o.ebene * geschossHoeheM
    const id = `p${nr++}`
    if (o.typ === 'tuer' && o.ebene === 0) {
      const unten = Math.max(0, o.bruestungM ?? 0)
      const hoehe = o.sturzM !== undefined && o.sturzM - unten >= 1.7 ? r2(o.sturzM - unten) : 2.1
      tueren.push({ id, side, offsetAlongM: offset, widthM: o.breiteM, heightM: hoehe })
      continue
    }
    // Fenster; Türen in Obergeschossen (Balkontüren) werden als raumhohes Fenster eingezeichnet
    const ist = o.typ === 'tuer'
    const unten = Math.max(0, o.bruestungM ?? (ist ? 0 : 0.9))
    const hoehe = o.sturzM !== undefined && o.sturzM - unten >= 0.3 ? r2(o.sturzM - unten) : (ist ? 2.1 : 1.4)
    fenster.push({ id, side, offsetAlongM: offset, bottomY: r2(basis + unten), widthM: o.breiteM, heightM: hoehe, floorIndex: o.ebene })
  }
  return { tueren, fenster, vorderseite: vorne }
}

/** Ein Vorbau an einer Kante des Hauptkörpers. alongM: ab Kantenmitte in Plan-Richtung (x nach rechts bzw. y nach unten). */
export interface PlanVorbauAnKante { kante: PlanKante; alongM: number; breiteM: number; tiefeM: number }

const MIN_VORSPRUNG_M = 0.5

/** Ordnet jeden Vorbau der Kante zu, über die er hinausragt (größter Überstand). Vorbauten ohne Lage oder ohne Überstand fallen weg. */
export function vorbautenAnKanten(vorbauten: Vorbau[], r: Rechteck, meterJePunkt: number): PlanVorbauAnKante[] {
  const out: PlanVorbauAnKante[] = []
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2
  for (const v of vorbauten) {
    const l = v.lage
    if (!l) continue
    const ueber: { k: PlanKante; m: number }[] = [
      { k: 'unten', m: (l.y1 - r.y1) * meterJePunkt }, { k: 'oben', m: (r.y0 - l.y0) * meterJePunkt },
      { k: 'rechts', m: (l.x1 - r.x1) * meterJePunkt }, { k: 'links', m: (r.x0 - l.x0) * meterJePunkt },
    ]
    ueber.sort((a, b) => b.m - a.m)
    const best = ueber[0]
    if (best.m < MIN_VORSPRUNG_M) continue
    const waagerecht = best.k === 'unten' || best.k === 'oben'
    const breite = ((waagerecht ? l.x1 - l.x0 : l.y1 - l.y0) * meterJePunkt)
    const mitte = waagerecht ? (l.x0 + l.x1) / 2 - cx : (l.y0 + l.y1) / 2 - cy
    out.push({ kante: best.k, alongM: r2(mitte * meterJePunkt), breiteM: r2(breite), tiefeM: r2(best.m) })
  }
  return out
}

/**
 * Vorbauten der Geschosse zu Modell-Vorbauten zusammenfassen: derselbe Vorbau in mehreren Geschossen (gleiche Kante,
 * ähnliche Breite und Tiefe) ist ein durchgehender Körper, dessen Höhe die Geschosse zusammenzählt. Lage nach dem untersten Geschoss.
 */
export function vorbautenFuerModell(geschosse: { ebene: number; vorbauten: PlanVorbauAnKante[] }[], vorderseite: PlanKante, geschossHoeheM: number): CadVorbau[] {
  const n = NORMALE[vorderseite]
  const xhat: [number, number] = [n[1], -n[0]]
  const gruppen: { v: PlanVorbauAnKante; anzahl: number }[] = []
  for (const g of geschosse.filter((q) => q.ebene >= 0).sort((a, b) => a.ebene - b.ebene)) {
    for (const v of g.vorbauten) {
      const gleich = gruppen.find((q) => q.v.kante === v.kante && Math.abs(q.v.breiteM - v.breiteM) < 0.4 && Math.abs(q.v.tiefeM - v.tiefeM) < 0.4)
      if (gleich) gleich.anzahl++
      else gruppen.push({ v, anzahl: 1 })
    }
  }
  return gruppen.map(({ v, anzahl }, i) => {
    const w = NORMALE[v.kante]
    const dotN = w[0] * n[0] + w[1] * n[1], dotX = w[0] * xhat[0] + w[1] * xhat[1]
    const side: CadVorbau['side'] = dotN === 1 ? 'front' : dotN === -1 ? 'back' : dotX === 1 ? 'right' : 'left'
    const richtung: [number, number] = v.kante === 'unten' || v.kante === 'oben' ? [1, 0] : [0, 1]
    const entlang = side === 'front' || side === 'back' ? richtung[0] * xhat[0] + richtung[1] * xhat[1] : richtung[0] * n[0] + richtung[1] * n[1]
    return { id: `v${i}`, side, offsetAlongM: r2(v.alongM * entlang), breiteM: v.breiteM, tiefeM: v.tiefeM, hoeheM: r2(anzahl * geschossHoeheM) }
  })
}
