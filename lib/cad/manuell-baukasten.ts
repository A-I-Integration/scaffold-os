// ============================================================
// SCAFFOLD OS – Manueller Aufmaß-Baukasten
//
// Rechnet die Eingaben der Baukasten-Maske (Rechteck oder Wandzug mit
// Länge/Höhe/Abbiegung je Wand, Dach, Öffnungen) in die Gebäudeparameter
// des CAD um. Allgemeine Regeln, keine Sonderfälle:
//  • Ein Wandzug muss sich schließen; sonst wird die Lücke gemeldet, nichts erfunden.
//  • Jede Wand hat ihre eigene Höhe (→ Höhe je Gebäudekante).
//  • Fehlende Pflichtmaße werden gemeldet.
// ============================================================

import type { BuildingParams } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'
import { pruefeUmriss, rechteckUmriss, umrissBox, type UmrissPunkt } from '@/lib/calculations/cad-umriss'

export interface BaukastenWand {
  laengeM: number
  hoeheM: number
  /** Abbiegung am Ende der Wand nach rechts (Grad). 90 = rechtwinklige Ecke. */
  winkelGrad: number
}

/** Leistungen und Zusatzmaterial, die in der Maske angeklickt werden. */
export interface BaukastenZusatz { nr: string; name: string; liste: string; menge: number; preis: number }
export interface BaukastenLeistungen {
  /** Gerüstbreite in m (0 = Standard des Systems) */
  breiteM: number
  /** Außentreppe automatisch erzeugen */
  treppe: boolean
  dachfang: boolean
  dachfangHoeheM: number
  kederplane: boolean
  kederVonM: number
  kederBisM: number
  zusatz: BaukastenZusatz[]
}
export const LEISTUNGEN_START: BaukastenLeistungen = { breiteM: 0, treppe: true, dachfang: false, dachfangHoeheM: 1, kederplane: false, kederVonM: 0, kederBisM: 0, zusatz: [] }

export interface BaukastenEingaben {
  form: 'rechteck' | 'wandzug' | 'gezeichnet'
  /** Gezeichneter Umriss (Wandanfänge) mit Höhe je Kante, aus dem Umriss-Zeichner */
  gezeichnet?: { umriss: UmrissPunkt[]; kantenHoeheM: number[] }
  leistungen?: BaukastenLeistungen
  laengeM: number
  breiteM: number
  hoeheM: number
  waende: BaukastenWand[]
  dach: BuildingParams['roofForm']
  traufhoeheM: number
  dachhoeheM: number
  ueberstandM: number
  fenster: number
  tueren: number
  balkone: number
}

export const BAUKASTEN_START: BaukastenEingaben = {
  form: 'rechteck', laengeM: 0, breiteM: 0, hoeheM: 0,
  waende: [
    { laengeM: 0, hoeheM: 0, winkelGrad: 90 },
    { laengeM: 0, hoeheM: 0, winkelGrad: 90 },
    { laengeM: 0, hoeheM: 0, winkelGrad: 90 },
    { laengeM: 0, hoeheM: 0, winkelGrad: 90 },
  ],
  dach: 'satteldach', traufhoeheM: 0, dachhoeheM: 0, ueberstandM: 0.5, fenster: 0, tueren: 0, balkone: 0,
}

export interface BaukastenErgebnis {
  ok: boolean
  building?: BuildingParams
  fehler: string[]
  hinweise: string[]
}

const rund = (n: number) => Math.round(n * 100) / 100
const de = (n: number) => String(rund(n)).replace('.', ',')

/** Schließt der Wandzug? Liefert den Umriss (Wandanfänge) und die Lücke am Ende in Metern. */
export function wandzugZuUmriss(waende: BaukastenWand[]): { umriss: UmrissPunkt[]; lueckeM: number } {
  const punkte: UmrissPunkt[] = []
  let x = 0, z = 0, richtung = 0
  for (const w of waende) {
    punkte.push({ x: rund(x), z: rund(z) })
    x += Math.cos(richtung) * w.laengeM
    z += Math.sin(richtung) * w.laengeM
    richtung += (w.winkelGrad * Math.PI) / 180
  }
  return { umriss: punkte, lueckeM: Math.hypot(x, z) }
}

/** Gerüst-Optionen aus den angeklickten Leistungen (nur gesetzte Werte; Standard bleibt Standard). */
export function leistungenZuOptionen(l: BaukastenLeistungen | undefined): NonNullable<BuildingParams['geruestOptionen']> {
  const o: NonNullable<BuildingParams['geruestOptionen']> = {}
  if (!l) return o
  if (l.breiteM > 0) o.breiteM = l.breiteM
  if (!l.treppe) o.treppe = false
  if (l.dachfang && l.dachfangHoeheM > 0) o.dachfang = { hoeheM: l.dachfangHoeheM }
  if (l.kederplane && l.kederBisM > l.kederVonM) o.kederplane = { vonM: l.kederVonM, bisM: l.kederBisM }
  return o
}

/** Zusatzmaterial als Stücklistenpositionen für das Angebot. */
export function zusatzAlsMaterial(zusatz: BaukastenZusatz[] | undefined): MaterialItem[] {
  return (zusatz ?? []).filter((z) => z.menge > 0).map((z) => ({
    articleNumber: z.nr, name: z.name, category: 'Zusatzmaterial', quantity: z.menge, unit: 'Stk',
    unitPrice: z.preis, totalPrice: Math.round(z.menge * z.preis * 100) / 100, weightKg: 0,
    riskLevel: 'low' as const, aiRecommendation: 'Von Hand gewählt (Baukasten)',
  }))
}

export function baukastenZuGebaeude(e: BaukastenEingaben): BaukastenErgebnis {
  const r = baukastenZuGebaeudeOhneOptionen(e)
  if (!r.ok || !r.building) return r
  const o = leistungenZuOptionen(e.leistungen)
  return Object.keys(o).length ? { ...r, building: { ...r.building, geruestOptionen: o } } : r
}

function baukastenZuGebaeudeOhneOptionen(e: BaukastenEingaben): BaukastenErgebnis {
  const fehler: string[] = []
  const hinweise: string[] = []
  const gemeinsam = {
    roofForm: e.dach, floors: 0, floorHeightsM: [] as number[],
    windowCount: Math.max(0, Math.round(e.fenster)), doorCount: Math.max(0, Math.round(e.tueren)), balconyCount: Math.max(0, Math.round(e.balkone)),
    overhangM: Math.max(0, e.ueberstandM), sides: ['front', 'back', 'left', 'right'] as BuildingParams['sides'], setbackM: 0,
  }
  const dachH = e.dach === 'flachdach' || e.dach === 'kein' ? 0 : Math.max(0, e.dachhoeheM)

  if (e.form === 'rechteck') {
    if (!(e.laengeM > 0)) fehler.push('Länge fehlt.')
    if (!(e.breiteM > 0)) fehler.push('Breite fehlt.')
    if (!(e.hoeheM > 0)) fehler.push('Höhe fehlt.')
    if (fehler.length) return { ok: false, fehler, hinweise }
    const traufe = e.traufhoeheM > 0 ? e.traufhoeheM : e.hoeheM
    return { ok: true, fehler, hinweise, building: { ...gemeinsam, lengthM: rund(e.laengeM), widthM: rund(e.breiteM), heightM: rund(e.hoeheM), eavesHeightM: rund(traufe), roofHeightM: rund(dachH) } }
  }

  if (e.form === 'gezeichnet') {
    const g = e.gezeichnet
    if (!g || g.umriss.length < 3) return { ok: false, fehler: ['Noch kein Umriss gezeichnet.'], hinweise }
    const hoehen = g.umriss.map((_, i) => g.kantenHoeheM[i] || e.hoeheM)
    if (hoehen.some((h) => !(h > 0))) return { ok: false, fehler: ['Höhe fehlt: Beim Zeichnen die Oberkante je Figur eintragen oder unter „Rechteck“ die Höhe setzen.'], hinweise }
    const probleme = pruefeUmriss(g.umriss)
    if (probleme.length) return { ok: false, fehler: probleme, hinweise }
    const box = umrissBox(g.umriss)
    const hoechste = Math.max(...hoehen)
    return { ok: true, fehler, hinweise, building: { ...gemeinsam, lengthM: rund(box.lengthM), widthM: rund(box.widthM), heightM: rund(hoechste), eavesHeightM: rund(e.traufhoeheM > 0 ? e.traufhoeheM : hoechste), roofHeightM: rund(dachH), umriss: g.umriss, umrissKantenHoeheM: hoehen.map(rund) } }
  }

  const w = e.waende
  if (w.length < 3) fehler.push('Ein Wandzug braucht mindestens 3 Wände.')
  w.forEach((x, i) => {
    if (!(x.laengeM > 0)) fehler.push(`Wand ${i + 1}: Länge fehlt.`)
    if (!(x.hoeheM > 0)) fehler.push(`Wand ${i + 1}: Höhe fehlt.`)
  })
  if (fehler.length) return { ok: false, fehler, hinweise }
  const { umriss, lueckeM } = wandzugZuUmriss(w)
  if (lueckeM > 0.1) {
    return { ok: false, fehler: [`Der Wandzug schließt nicht: Zwischen dem Ende der letzten Wand und dem Start fehlen ${de(lueckeM)} m. Länge oder Abbiegung einer Wand prüfen.`], hinweise }
  }
  const probleme = pruefeUmriss(umriss)
  if (probleme.length) return { ok: false, fehler: probleme, hinweise }
  if (lueckeM > 0.005) hinweise.push(`Wandzug schließt mit ${de(lueckeM)} m Abweichung – bitte prüfen.`)
  const box = umrissBox(umriss)
  const hoechste = Math.max(...w.map((x) => x.hoeheM))
  const traufe = e.traufhoeheM > 0 ? e.traufhoeheM : hoechste
  return {
    ok: true, fehler, hinweise,
    building: { ...gemeinsam, lengthM: rund(box.lengthM), widthM: rund(box.widthM), heightM: rund(hoechste), eavesHeightM: rund(traufe), roofHeightM: rund(dachH), umriss, umrissKantenHoeheM: w.map((x) => rund(x.hoeheM)) },
  }
}

/** Rechteck als Wandzug übernehmen (Umschalten von „Rechteck“ auf „Wandzug“ behält die Maße). */
export function rechteckAlsWandzug(laengeM: number, breiteM: number, hoeheM: number): BaukastenWand[] {
  return [laengeM, breiteM, laengeM, breiteM].map((l) => ({ laengeM: l, hoeheM, winkelGrad: 90 }))
}

export { rechteckUmriss }
