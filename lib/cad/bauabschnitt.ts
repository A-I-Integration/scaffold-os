// SCAFFOLD OS – 2. Bauabschnitt: das Gerüst aus dem CAD-Modell auf eine geringere Höhe kappen.
//
// Annahmen (bewusst einfach, im LV-Text und in den Annahmen sichtbar):
//  • Die oberste verbleibende Lage ist die, deren Oberkante der gewünschten Höhe am nächsten liegt („ca. 21,5 m“); bei Gleichstand die untere.
//  • Bauteile mit Lage (levelId) bleiben mit ihrer Lage; Anker bleiben unterhalb der Schnitthöhe.
//  • Treppe und Aufzug werden auf die verbleibenden Lagen gekürzt; ihre Stückzahl bleibt (Preis je Stück aus dem Katalog/Lager).
//  • Die Fläche wird im Verhältnis der Feldflächen der verbleibenden zu allen Lagen verkleinert.

import type { CADModel, ScaffoldComponent3D } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'
import { generateBillOfMaterials } from '@/lib/calculations/cad-engine'

export interface GekapptesModell {
  model: CADModel
  /** Tatsächliche Oberkante der obersten verbleibenden Lage (m) */
  obenM: number
  /** Anteil der Gerüstfläche, der im 2. Bauabschnitt bleibt (0..1) */
  flaechenAnteil: number
  /** Anzahl der verbleibenden / aller Lagen (je Seite, also Lagen übereinander) */
  lagenBehalten: number
  lagenGesamt: number
}

const r2 = (v: number): number => Math.round(v * 100) / 100

/** Gibt null zurück, wenn nichts zu kappen ist (Höhe ≥ Gerüsthöhe) oder keine Lage übrig bliebe. */
export function kappeModellAufHoehe(model: CADModel, hoeheM: number): GekapptesModell | null {
  if (!(hoeheM > 0) || !model.levels?.length) return null
  // Nächstgelegene Lagen-Oberkante zur gewünschten Höhe (die Lagen jeder Seite werden einzeln geführt)
  const tops = [...new Set(model.levels.map((l) => r2(l.topY)))].sort((a, b) => a - b)
  const obenRaster = tops.reduce((best, t) => (Math.abs(t - hoeheM) < Math.abs(best - hoeheM) - 1e-9 ? t : best), tops[0])
  const behalten = model.levels.filter((l) => l.topY <= obenRaster + 1e-6)
  if (!behalten.length || behalten.length >= model.levels.length) return null
  const bleibtId = new Set(behalten.map((l) => l.id))
  const obenM = Math.max(...behalten.map((l) => l.topY))
  // Lagen je Seite (Lagen-Indizes), nicht alle Lagen aller Seiten zusammen
  const anzahlBehalten = new Set(behalten.map((l) => l.index)).size
  const anzahlGesamt = new Set(model.levels.map((l) => l.index)).size

  const flaecheJe = (ebenen: CADModel['levels']): number =>
    ebenen.reduce((s, l) => s + l.fields.reduce((a, f) => a + f.lengthM, 0) * l.heightM, 0)
  const ganz = flaecheJe(model.levels)
  const flaechenAnteil = ganz > 0 ? Math.min(1, flaecheJe(behalten) / ganz) : anzahlBehalten / anzahlGesamt

  const comps: ScaffoldComponent3D[] = []
  for (const c of model.components3D) {
    if (c.type === 'stair' && c.flights && c.flights > 0 && c.id === 'stair-frame-0') {
      // Außentreppe über mehrere Lagen: Läufe der verbleibenden Lagen
      const flights = Math.min(c.flights, anzahlBehalten)
      const hAlt = c.scale[1]
      const y0 = c.position[1] - hAlt / 2
      const rises = c.lagenHoehenM?.slice(0, flights)
      const hNeu = rises ? rises.reduce((s, v) => s + v, 0) : hAlt * (flights / c.flights)
      comps.push({ ...c, flights, ...(rises ? { lagenHoehenM: rises } : {}), position: [c.position[0], y0 + hNeu / 2, c.position[2]], scale: [c.scale[0], hNeu, c.scale[2]] })
      continue
    }
    if (c.type === 'elevator') {
      const bisAlt = c.scale[1]
      const bis = Math.min(bisAlt, obenM)
      comps.push({ ...c, position: [c.position[0], bis / 2, c.position[2]], scale: [c.scale[0], bis, c.scale[2]] })
      continue
    }
    if (c.type === 'anchor') {
      if (c.position[1] <= obenM + 1e-6) comps.push(c)
      continue
    }
    if (c.levelId) {
      if (bleibtId.has(c.levelId)) comps.push(c)
      continue
    }
    // ohne Lage (z. B. Schutzdach, Lastverteiler): bleibt, wenn es unterhalb der Schnitthöhe liegt
    if (c.position[1] <= obenM + 1e-6) comps.push(c)
  }

  const levels = model.levels.filter((l) => bleibtId.has(l.id))
  const fieldIds = new Set(levels.flatMap((l) => l.fields.map((f) => f.id)))
  const felder = model.fields.filter((f) => fieldIds.has(f.id) || (f.levelIndex !== undefined && levels.some((l) => l.index === f.levelIndex)))
  const kapp: CADModel = {
    ...model,
    levels,
    fields: felder.length ? felder : model.fields,
    components3D: comps,
    anchors: model.anchors.filter((a) => a.positionY <= obenM + 1e-6),
    totalHeightM: r2(Math.min(model.totalHeightM, obenM)),
    totalAreaM2: r2(model.totalAreaM2 * flaechenAnteil),
    levelCount: anzahlBehalten,
    fieldCount: levels.reduce((s, l) => s + l.fields.length, 0),
  }
  return { model: kapp, obenM: r2(obenM), flaechenAnteil, lagenBehalten: anzahlBehalten, lagenGesamt: anzahlGesamt }
}

/**
 * Materialliste für den 2. Bauabschnitt: je Artikel Menge und Gesamtpreis der übergebenen Liste (mit den Preisen der Firma)
 * im Verhältnis Stückliste(gekappt) / Stückliste(ganz). Artikel, die im gekappten Modell nicht mehr vorkommen, entfallen.
 */
export function kappeMaterial(materials: MaterialItem[], voll: CADModel, kapp: CADModel): MaterialItem[] {
  const a = new Map(generateBillOfMaterials(voll).map((m) => [m.articleNumber, m.quantity]))
  const b = new Map(generateBillOfMaterials(kapp).map((m) => [m.articleNumber, m.quantity]))
  const aus: MaterialItem[] = []
  for (const m of materials) {
    const q0 = a.get(m.articleNumber) ?? m.quantity
    const q1 = b.get(m.articleNumber) ?? 0
    if (!(q1 > 0)) continue
    const f = q0 > 0 ? Math.min(1, q1 / q0) : 1
    aus.push({ ...m, quantity: Math.round(m.quantity * f), totalPrice: Math.round(m.totalPrice * f * 100) / 100 })
  }
  return aus
}
