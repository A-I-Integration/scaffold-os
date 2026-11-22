// ============================================================
// SCAFFOLD OS – Gebäude bearbeiten (Wand, Geschoss, Dach): reine Logik hinter den Dialogen der Symbolleiste
// Jede Funktion gibt ein NEUES BuildingParams zurück oder einen Fehlertext; nichts wird still verändert oder erfunden.
// ============================================================

import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { umrissKanten, type UmrissPunkt } from '@/lib/calculations/cad-umriss'

export const ZAHL = (t: string): number | null => {
  const n = parseFloat(String(t).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const r2 = (v: number) => Math.round(v * 100) / 100

export type Ergebnis<T> = { ok: true; wert: T } | { ok: false; fehler: string }

/** Geschosse: Anzahl und optional eine Höhe je Geschoss. Leere Höhenliste = alle gleich hoch (Gebäudehöhe geteilt durch Anzahl, wie in der Engine). */
export function setzeGeschosse(b: BuildingParams, anzahl: number, hoehen: (number | null)[] | null): Ergebnis<BuildingParams> {
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 12) return { ok: false, fehler: 'Die Zahl der Geschosse muss zwischen 1 und 12 liegen.' }
  if (!hoehen) return { ok: true, wert: { ...b, floors: anzahl, floorHeightsM: [] } }
  if (hoehen.length !== anzahl) return { ok: false, fehler: 'Für jedes Geschoss wird eine Höhe gebraucht.' }
  const h: number[] = []
  for (let i = 0; i < hoehen.length; i++) {
    const v = hoehen[i]
    if (v === null || !(v >= 1.5 && v <= 6)) return { ok: false, fehler: `Geschoss ${i + 1}: Höhe zwischen 1,5 und 6 m eingeben.` }
    h.push(r2(v))
  }
  return { ok: true, wert: { ...b, floors: anzahl, floorHeightsM: h } }
}

/** Summe der Geschosshöhen; ohne eigene Höhen: gleichmäßig aus Traufhöhe (sonst Gebäudehöhe). */
export function geschossHoehen(b: BuildingParams): number[] {
  if (b.floorHeightsM?.length === b.floors && b.floors > 0) return b.floorHeightsM.slice()
  const gesamt = b.eavesHeightM > 0 ? b.eavesHeightM : b.heightM
  return b.floors > 0 ? Array(b.floors).fill(r2(gesamt / b.floors)) : []
}

/** Traufe (Oberkante des obersten Geschosses) aus den Geschosshöhen setzen; Gebäudehöhe = Traufe + Dachhöhe. */
export function traufeAusGeschossen(b: BuildingParams): BuildingParams {
  const summe = r2(geschossHoehen(b).reduce((s, v) => s + v, 0))
  if (!(summe > 0)) return b
  const dach = Math.max(0, b.roofHeightM || 0)
  return { ...b, eavesHeightM: summe, heightM: r2(summe + dach) }
}

export const DACHFORMEN: { id: NonNullable<BuildingParams['roofForm']>; label: string }[] = [
  { id: 'flachdach', label: 'Flachdach' }, { id: 'satteldach', label: 'Satteldach' }, { id: 'walmdach', label: 'Walmdach' },
  { id: 'pultdach', label: 'Pultdach' }, { id: 'mansardendach', label: 'Mansarddach' }, { id: 'kein', label: 'Kein Dach' },
]

export interface DachEingabe {
  form: NonNullable<BuildingParams['roofForm']>
  traufeM: number | null
  dachHoeheM: number | null
  ueberstandM: number | null
  pultNiedrigeSeite?: 'front' | 'back' | 'left' | 'right'
}

/** Dach: Form, Traufhöhe, Dachhöhe (First über Traufe) und Überstand. Gebäudehöhe = Traufe + Dachhöhe, so wie die Engine sie liest. */
export function setzeDach(b: BuildingParams, e: DachEingabe): Ergebnis<BuildingParams> {
  const flach = e.form === 'flachdach' || e.form === 'kein'
  const ueber = e.ueberstandM ?? 0
  if (ueber < 0 || ueber > 2) return { ok: false, fehler: 'Der Dachüberstand liegt zwischen 0 und 2 m.' }
  let traufe = b.eavesHeightM, dach = 0
  if (flach) {
    traufe = e.traufeM ?? (b.eavesHeightM > 0 ? b.eavesHeightM : b.heightM)
    if (!(traufe > 0)) return { ok: false, fehler: 'Die Gebäudehöhe fehlt.' }
  } else {
    if (e.traufeM === null || !(e.traufeM > 0)) return { ok: false, fehler: 'Traufhöhe eingeben (größer 0).' }
    if (e.dachHoeheM === null || !(e.dachHoeheM > 0.1)) return { ok: false, fehler: 'Dachhöhe (Höhe vom Traufpunkt bis zum First) eingeben.' }
    if (e.dachHoeheM > 12) return { ok: false, fehler: 'Die Dachhöhe über 12 m ist unplausibel, bitte prüfen.' }
    traufe = e.traufeM; dach = e.dachHoeheM
  }
  const neu: BuildingParams = { ...b, roofForm: e.form, eavesHeightM: r2(traufe), roofHeightM: r2(dach), heightM: r2(traufe + dach), overhangM: r2(ueber) }
  if (e.form === 'pultdach' && e.pultNiedrigeSeite) neu.geruestOptionen = { ...(b.geruestOptionen ?? {}), pultNiedrigeSeite: e.pultNiedrigeSeite }
  return { ok: true, wert: neu }
}

export interface WandZeile { nr: number; laengeM: number; hoeheM: number }

/** Wände eines Umrisses: Länge je Kante und Höhe (ohne eigene Eingabe die Gebäudehöhe). */
export function wandZeilen(b: BuildingParams): WandZeile[] {
  const u = (b.umriss ?? []) as UmrissPunkt[]
  if (u.length < 3) return []
  const kanten = umrissKanten(u)
  return kanten.map((k, i) => ({ nr: i + 1, laengeM: r2(k.laengeM), hoeheM: b.umrissKantenHoeheM?.length === u.length ? b.umrissKantenHoeheM[i] : b.heightM }))
}

/** Höhe einer Wand setzen. Sind danach alle gleich, entfällt die Einzelangabe (dann gilt die Gebäudehöhe und die Dach-Regel der Engine). */
export function setzeWandHoehe(b: BuildingParams, index: number, hoeheM: number | null): Ergebnis<BuildingParams> {
  const z = wandZeilen(b)
  if (index < 0 || index >= z.length) return { ok: false, fehler: 'Diese Wand gibt es nicht.' }
  if (hoeheM === null || !(hoeheM >= 1 && hoeheM <= 60)) return { ok: false, fehler: 'Wandhöhe zwischen 1 und 60 m eingeben.' }
  const neu = z.map((w, i) => (i === index ? r2(hoeheM) : w.hoeheM))
  const hoechste = Math.max(...neu)
  const gleich = neu.every((h) => h === neu[0])
  return { ok: true, wert: { ...b, umrissKantenHoeheM: gleich ? undefined : neu, heightM: gleich ? neu[0] : hoechste } }
}

/** Rechteck-Gebäude: Länge, Breite und Gebäudehöhe. */
export function setzeRechteck(b: BuildingParams, laengeM: number | null, breiteM: number | null, hoeheM: number | null): Ergebnis<BuildingParams> {
  if (b.umriss && b.umriss.length >= 3) return { ok: false, fehler: 'Bei einem Gebäude mit Umriss gelten die Wände einzeln.' }
  if (laengeM === null || !(laengeM >= 1 && laengeM <= 200)) return { ok: false, fehler: 'Länge zwischen 1 und 200 m eingeben.' }
  if (breiteM === null || !(breiteM >= 1 && breiteM <= 200)) return { ok: false, fehler: 'Breite zwischen 1 und 200 m eingeben.' }
  if (hoeheM === null || !(hoeheM >= 1 && hoeheM <= 60)) return { ok: false, fehler: 'Höhe zwischen 1 und 60 m eingeben.' }
  const dach = Math.max(0, b.roofHeightM || 0)
  const traufe = b.roofForm && b.roofForm !== 'flachdach' && b.roofForm !== 'kein' && dach > 0 ? r2(Math.max(0.5, hoeheM - dach)) : r2(hoeheM)
  return { ok: true, wert: { ...b, lengthM: r2(laengeM), widthM: r2(breiteM), heightM: r2(hoeheM), eavesHeightM: traufe } }
}
