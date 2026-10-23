// ============================================================
// SCAFFOLD OS – Teilabbau: Was wird abgebaut, wie viel Material, wie viele Stunden, wie lange mit wie vielen Leuten?
//
// Auswahl (alle drei liefern dieselbe Art Ergebnis):
//  • per Klick/ID: eine Liste von Bauteil-Kennungen (aus dem 3D-Modell)
//  • per Zahl: „oberste N Lagen“, „ca. X m²“ (oben beginnend, ganze Lagen) oder „N Teile“ (von oben nach unten)
//
// Annahmen (stehen so in `annahmen`):
//  • Abgebaut wird von oben nach unten. Bei Fläche/Teilen wird die nächste ganze Lage mitgenommen, bis die Zahl erreicht ist.
//  • Abbaustunden = Abbaustunden des ganzen Gerüsts × Flächenanteil der abgebauten Lagen. Bei Auswahl einzelner Teile: Anteil nach Teilen.
//  • Einsatzplan: Stunden / (Personen × Stunden je Tag), je Lage anteilig nach Fläche.
// ============================================================

import type { CADModel, ScaffoldComponent3D, ScaffoldLevel } from '@/lib/calculations/cad-engine'
import { generateBillOfMaterials } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'

export type TeilabbauAuswahl =
  | { art: 'ids'; ids: string[] }
  | { art: 'lagen'; anzahl: number }
  | { art: 'flaeche'; m2: number }
  | { art: 'teile'; anzahl: number }

export interface TeilabbauSchritt {
  schritt: number
  /** Lagen-Nummer (1 = unterste) */
  lage: number
  vonM: number
  bisM: number
  teile: number
  flaecheM2: number
  stunden: number
}

export interface TeilabbauErgebnis {
  bauteilIds: string[]
  anzahlTeile: number
  flaecheM2: number
  /** Anteil an der gesamten Gerüstfläche (0..1) */
  anteil: number
  material: MaterialItem[]
  gewichtKg: number
  stunden: number
  /** berechnete Stunden (vor einer Handkorrektur) */
  stundenBerechnet: number
  personen: number
  stundenJeTag: number
  /** Arbeitstage (aufgerundet, mindestens 1 bei Stunden > 0) */
  tage: number
  schritte: TeilabbauSchritt[]
  annahmen: string[]
}

const r2 = (v: number): number => Math.round(v * 100) / 100

const flaecheLage = (l: ScaffoldLevel): number => l.fields.reduce((a, f) => a + f.lengthM, 0) * l.heightM

/** Lagen übereinander (nach Index), mit Fläche, Ober-/Unterkante, absteigend von oben. */
function lagenVonOben(model: CADModel): { index: number; ids: string[]; flaecheM2: number; vonM: number; bisM: number }[] {
  const nachIndex = new Map<number, ScaffoldLevel[]>()
  for (const l of model.levels ?? []) nachIndex.set(l.index, [...(nachIndex.get(l.index) ?? []), l])
  return [...nachIndex.entries()]
    .map(([index, ls]) => ({
      index,
      ids: ls.map((l) => l.id),
      flaecheM2: ls.reduce((s, l) => s + flaecheLage(l), 0),
      vonM: Math.min(...ls.map((l) => l.bottomY)),
      bisM: Math.max(...ls.map((l) => l.topY)),
    }))
    .sort((a, b) => b.index - a.index)
}

export function berechneTeilabbau(
  model: CADModel,
  auswahl: TeilabbauAuswahl,
  opt: { gesamtAbbauStunden: number; personen?: number; stundenJeTag?: number; stundenHand?: number },
): TeilabbauErgebnis {
  const personen = Math.max(1, Math.round(opt.personen ?? 3))
  const stundenJeTag = opt.stundenJeTag && opt.stundenJeTag > 0 ? opt.stundenJeTag : 8
  const lagen = lagenVonOben(model)
  const gesamtFlaeche = lagen.reduce((s, l) => s + l.flaecheM2, 0) || model.totalAreaM2 || 0
  const annahmen = [
    'Abbau von oben nach unten.',
    `Abbaustunden = Abbaustunden des ganzen Gerüsts (${opt.gesamtAbbauStunden} h) × Anteil der abgebauten Fläche (bei einzelnen Teilen: Anteil der Teile).`,
    `Einsatzplan mit ${personen} Mitarbeitern und ${stundenJeTag} h je Arbeitstag.`,
  ]

  let comps: ScaffoldComponent3D[] = []
  let gewaehlteLagen: typeof lagen = []
  const levelIdsVon = (ls: typeof lagen) => new Set(ls.flatMap((l) => l.ids))
  const nachLagen = (ls: typeof lagen) => {
    const ids = levelIdsVon(ls)
    const untenM = ls.length ? Math.min(...ls.map((l) => l.vonM)) : Infinity
    return model.components3D.filter((c) => (c.levelId && ids.has(c.levelId)) || (c.type === 'anchor' && c.position[1] >= untenM - 1e-6))
  }

  if (auswahl.art === 'ids') {
    const ids = new Set(auswahl.ids)
    comps = model.components3D.filter((c) => ids.has(c.id))
  } else if (auswahl.art === 'lagen') {
    gewaehlteLagen = lagen.slice(0, Math.max(0, Math.round(auswahl.anzahl)))
    comps = nachLagen(gewaehlteLagen)
  } else if (auswahl.art === 'flaeche') {
    let summe = 0
    for (const l of lagen) { if (summe >= auswahl.m2 - 1e-9) break; gewaehlteLagen.push(l); summe += l.flaecheM2 }
    comps = nachLagen(gewaehlteLagen)
    if (gewaehlteLagen.length) annahmen.push(`Es werden ganze Lagen abgebaut, bis die gewünschten ${r2(auswahl.m2)} m² erreicht sind (tatsächlich ${r2(summe)} m²).`)
  } else {
    const sortiert = [...model.components3D].sort((a, b) => b.position[1] - a.position[1])
    comps = sortiert.slice(0, Math.max(0, Math.round(auswahl.anzahl)))
  }

  const material = comps.length ? generateBillOfMaterials({ ...model, components3D: comps }) : []
  const gewichtKg = Math.round(material.reduce((s, m) => s + m.weightKg * m.quantity, 0))

  // Fläche & Anteil
  let flaecheM2: number
  let anteil: number
  if (auswahl.art === 'ids' || auswahl.art === 'teile') {
    // Fläche der berührten Lagen anteilig nach Teilen dieser Lage
    const levelVon = new Map<string, number>()
    lagen.forEach((l) => l.ids.forEach((id) => levelVon.set(id, l.index)))
    const gesamtJeLage = new Map<number, number>()
    const gewaehltJeLage = new Map<number, number>()
    for (const c of model.components3D) { const li = c.levelId ? levelVon.get(c.levelId) : undefined; if (li !== undefined) gesamtJeLage.set(li, (gesamtJeLage.get(li) ?? 0) + 1) }
    for (const c of comps) { const li = c.levelId ? levelVon.get(c.levelId) : undefined; if (li !== undefined) gewaehltJeLage.set(li, (gewaehltJeLage.get(li) ?? 0) + 1) }
    flaecheM2 = lagen.reduce((s, l) => s + l.flaecheM2 * ((gewaehltJeLage.get(l.index) ?? 0) / Math.max(1, gesamtJeLage.get(l.index) ?? 1)), 0)
    anteil = gesamtFlaeche > 0 ? flaecheM2 / gesamtFlaeche : model.components3D.length ? comps.length / model.components3D.length : 0
    if (!(flaecheM2 > 0) && model.components3D.length) anteil = comps.length / model.components3D.length
  } else {
    flaecheM2 = gewaehlteLagen.reduce((s, l) => s + l.flaecheM2, 0)
    anteil = gesamtFlaeche > 0 ? flaecheM2 / gesamtFlaeche : 0
  }
  anteil = Math.min(1, Math.max(0, anteil))
  const stundenBerechnet = Math.ceil(opt.gesamtAbbauStunden * anteil)
  const stunden = opt.stundenHand !== undefined && opt.stundenHand >= 0 ? opt.stundenHand : stundenBerechnet
  const tage = stunden > 0 ? Math.max(1, Math.ceil(stunden / (personen * stundenJeTag))) : 0

  // Schritte je Lage (oben → unten), Teile nach Lage, Stunden anteilig nach Fläche
  const levelZuIndex = new Map<string, number>()
  lagen.forEach((l) => l.ids.forEach((id) => levelZuIndex.set(id, l.index)))
  const teileJeLage = new Map<number, number>()
  for (const c of comps) { const li = c.levelId ? levelZuIndex.get(c.levelId) : undefined; if (li !== undefined) teileJeLage.set(li, (teileJeLage.get(li) ?? 0) + 1) }
  const beteiligt = lagen.filter((l) => teileJeLage.has(l.index))
  const summeTeile = beteiligt.reduce((s, l) => s + (teileJeLage.get(l.index) ?? 0), 0) || 1
  const schritte: TeilabbauSchritt[] = beteiligt.map((l, i) => {
    const t = teileJeLage.get(l.index) ?? 0
    return { schritt: i + 1, lage: l.index + 1, vonM: r2(l.vonM), bisM: r2(l.bisM), teile: t, flaecheM2: r2(l.flaecheM2), stunden: r2((stunden * t) / summeTeile) }
  })

  return { bauteilIds: comps.map((c) => c.id), anzahlTeile: comps.length, flaecheM2: r2(flaecheM2), anteil, material, gewichtKg, stunden, stundenBerechnet, personen, stundenJeTag, tage, schritte, annahmen }
}
