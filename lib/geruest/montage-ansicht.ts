// ============================================================
// SCAFFOLD OS – Montage-Ansicht: nur das Gerüst, je Seite, groß, mit Maßen
//
// Wie ein Montageplan aus der Gerüstsoftware: Ständer, Beläge je Lage, Zwischenholm, Handlauf oben,
// Diagonalen, Treppenfelder, Feldbreiten unten und Lagenhöhen links. Alle Linien aus den Feldern des Modells.
// Diagonalenrichtung: Vorderseite aus dem Modell, übrige Seiten wechselnd je Feld (Richtung dort nicht ausgelesen).
// Schematisch, kein Standsicherheitsnachweis.
// ============================================================

import { feldRahmen, type CADModel, type ScaffoldField } from '@/lib/calculations/cad-engine'
import { seitenBezeichnung } from '@/types/cad-layers'
import type { Zeichnung, ZLinie, ZText } from './plan-zeichnung'

const de = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

interface FeldAnsicht { f: ScaffoldField; a0: number; a1: number }

/** Schlüssel einer Gerüstseite: Rechteck-Seite oder Umriss-Kante */
export function seitenSchluessel(f: Pick<ScaffoldField, 'side' | 'kante'>): string {
  return f.kante !== undefined ? `k${f.kante}` : f.side
}

export function erzeugeMontageAnsichten(model: CADModel): Zeichnung[] {
  const gruppen = new Map<string, ScaffoldField[]>()
  for (const f of model.fields) gruppen.set(seitenSchluessel(f), [...(gruppen.get(seitenSchluessel(f)) ?? []), f])
  const reihenfolge = ['front', 'right', 'back', 'left']
  const schluessel = [...gruppen.keys()].sort((a, b) => {
    const ia = reihenfolge.indexOf(a), ib = reihenfolge.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'de', { numeric: true })
  })
  return schluessel.map((k) => erzeugeEine(model, k, gruppen.get(k)!))
}

function erzeugeEine(model: CADModel, schluessel: string, felder: ScaffoldField[]): Zeichnung {
  const linien: ZLinie[] = []
  const texte: ZText[] = []
  const L = (x1: number, y1: number, x2: number, y2: number) => linien.push({ x1, y1, x2, y2, layer: 'TEXTE' })
  const dick = (x1: number, y: number, x2: number, d: number) => { L(x1, y, x2, y); L(x1, y + d, x2, y + d) }

  // Längsachse der Seite (von außen gesehen, links → rechts) aus dem Feldrahmen
  const achse = (f: ScaffoldField): number => {
    const r = feldRahmen(f, model.building)
    const [ox, oz] = r.toWorld(0, 0), [ex, ez] = r.toWorld(1, 0)
    const n = Math.hypot(ex - ox, ez - oz) || 1
    return (f.positionX * (ex - ox) + f.positionZ * (ez - oz)) / n
  }
  const ansicht: FeldAnsicht[] = felder.map((f) => { const m = achse(f); return { f, a0: m - f.lengthM / 2, a1: m + f.lengthM / 2 } })
  const minA = Math.min(...ansicht.map((a) => a.a0))
  const maxA = Math.max(...ansicht.map((a) => a.a1))
  const ebenen = model.levels.filter((l) => ansicht.some((a) => a.f.levelIndex === l.index)).sort((a, b) => a.index - b.index)
  const hoehe = Math.max(0, ...ebenen.map((l) => l.topY))
  const th = Math.max(0.12, (maxA - minA) / 90)

  // Treppenfelder: ein Treppenbauteil liegt innerhalb des Feldes und der Lage
  const treppen = model.components3D.filter((c) => c.id.startsWith('stair-'))
  const istTreppe = (a: FeldAnsicht, l: { bottomY: number; topY: number }): boolean =>
    treppen.some((c) => c.position[1] >= l.bottomY - 0.05 && c.position[1] <= l.topY + 0.05 && Math.hypot(c.position[0] - a.f.positionX, c.position[2] - a.f.positionZ) <= a.f.lengthM / 2 + 0.02)
  const diagonale = (a: FeldAnsicht): number | null => {
    const c = model.components3D.find((x) => x.id === `diagonal-${a.f.id}`)
    if (!c) return null
    if (a.f.kante === undefined && a.f.side === 'front') return Math.sign(c.rotation[2]) || 1
    return (a.f.index + a.f.levelIndex) % 2 === 0 ? 1 : -1
  }

  // Ständer je Feldgrenze über die Höhe der Felder dort
  const grenzen = new Map<number, [number, number]>()
  for (const a of ansicht) {
    const l = ebenen.find((e) => e.index === a.f.levelIndex)!
    for (const x of [a.a0, a.a1]) {
      const k = Math.round(x * 100) / 100
      const g = grenzen.get(k)
      grenzen.set(k, g ? [Math.min(g[0], l.bottomY), Math.max(g[1], l.topY)] : [l.bottomY, l.topY])
    }
  }
  for (const [x, [u, o]] of grenzen) L(x, u, x, o + (o >= hoehe - 1e-6 ? 1.0 : 0))

  for (const a of ansicht) {
    const l = ebenen.find((e) => e.index === a.f.levelIndex)!
    const oben = l.topY >= hoehe - 1e-6
    dick(a.a0, l.bottomY, a.a1, 0.05)
    if (!istTreppe(a, l)) {
      L(a.a0, l.bottomY + 1.0, a.a1, l.bottomY + 1.0)
      const d = diagonale(a)
      if (d !== null) { if (d >= 0) L(a.a0, l.bottomY, a.a1, l.topY); else L(a.a0, l.topY, a.a1, l.bottomY) }
    } else {
      // Treppe: Podest oben am Feldende, Lauf als Schräge, Handlauf
      const p = Math.min(0.6, a.f.lengthM / 4)
      const zurRechten = a.f.levelIndex % 2 === 0
      dick(zurRechten ? a.a1 - p : a.a0, l.topY, zurRechten ? a.a1 : a.a0 + p, 0.05)
      if (zurRechten) { L(a.a0 + 0.1, l.bottomY, a.a1 - p, l.topY); L(a.a0 + 0.1, l.bottomY + 1.0, a.a1 - p, l.topY + 1.0) }
      else { L(a.a1 - 0.1, l.bottomY, a.a0 + p, l.topY); L(a.a1 - 0.1, l.bottomY + 1.0, a.a0 + p, l.topY + 1.0) }
    }
    if (oben) { L(a.a0, l.topY + 0.5, a.a1, l.topY + 0.5); L(a.a0, l.topY + 1.0, a.a1, l.topY + 1.0); dick(a.a0, l.topY, a.a1, 0.05) }
  }

  // Maße: Feldbreiten unten (unterste vorhandene Lage je Spalte), Lagenhöhen links
  const unten = -th * 3
  const tick = th * 0.5
  const kette = new Map<string, FeldAnsicht>()
  for (const a of ansicht) { const k = `${Math.round(a.a0 * 100)}|${Math.round(a.a1 * 100)}`; const v = kette.get(k); if (!v || a.f.levelIndex < v.f.levelIndex) kette.set(k, a) }
  for (const a of kette.values()) {
    L(a.a0, unten, a.a1, unten); L(a.a0, unten - tick, a.a0, unten + tick); L(a.a1, unten - tick, a.a1, unten + tick)
    texte.push({ x: (a.a0 + a.a1) / 2, y: unten - th * 1.5, hoehe: th, text: `${de(a.a1 - a.a0)} m`, layer: 'TEXTE', ausrichtung: 'mitte' })
  }
  const links = minA - th * 4
  for (const l of ebenen) {
    L(links, l.bottomY, links, l.topY); L(links - tick, l.bottomY, links + tick, l.bottomY); L(links - tick, l.topY, links + tick, l.topY)
    texte.push({ x: links - th * 0.4, y: (l.bottomY + l.topY) / 2, hoehe: th, text: `${de(l.heightM)} m`, layer: 'TEXTE', ausrichtung: 'mitte', drehungGrad: 90 })
  }
  texte.push({ x: minA, y: hoehe + 1.0 + th * 2, hoehe: th * 1.4, text: `Montage-Ansicht ${seitenBezeichnung(schluessel)}`, layer: 'TEXTE', ausrichtung: 'links' })

  const xs = [...linien.flatMap((l) => [l.x1, l.x2]), links - th * 3]
  const ys = [...linien.flatMap((l) => [l.y1, l.y2]), unten - th * 3, hoehe + 1.0 + th * 4]
  return { id: 'vorderansicht', titel: `Montage-Ansicht ${seitenBezeichnung(schluessel)}`, linien, texte, grenzen: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } }
}
