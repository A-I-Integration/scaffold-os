// ============================================================
// SCAFFOLD OS – CAD-Projektdatei (speichern und wieder laden)
//
// Eine Textdatei (JSON) mit allem, was das CAD zum Wiederaufbau braucht:
// Gebäude, Gerüstsystem, Angaben für den Statiker, Notizen. Beim Laden wird
// jedes Feld geprüft; Unbekanntes oder Ungültiges wird verworfen, nie blind
// übernommen. Die Datei enthält KEINE Berechnung und keinen Standsicherheitsnachweis.
// ============================================================

import type { BuildingParams, BuildingSection } from '@/lib/calculations/cad-engine'
import { findeSystem } from '@/lib/calculations/geruest-systeme'
import { bereinigeStatikDaten, type StatikDaten } from '@/lib/statik-daten'
import type { CADNote } from '@/types/cad-notes'

export const PROJEKTDATEI_FORMAT = 'scaffoldos-cad-projekt'
export const PROJEKTDATEI_VERSION = 1
const MAX_MASS_M = 300
const MAX_PUNKTE = 200
const MAX_ABSCHNITTE = 50
const MAX_NOTIZEN = 500
const MAX_ARTIKELWAHL = 20000
const DACHFORMEN = ['flachdach', 'satteldach', 'walmdach', 'pultdach', 'mansardendach', 'kein'] as const
const SEITEN = ['front', 'back', 'left', 'right'] as const

export interface Projektdatei {
  format: typeof PROJEKTDATEI_FORMAT
  version: number
  name: string
  gespeichertAm: string
  /** true = erfundene Beispieldaten, keine echten Projektwerte */
  testdaten?: boolean
  building: BuildingParams
  systemId: string
  statikDaten: StatikDaten
  notizen: CADNote[]
  /** Katalogwahl: Bauteil-ID → Artikelnummer (optional, ältere Dateien haben sie nicht) */
  artikelWahl?: Record<string, string>
}

export type LeseErgebnis =
  | { ok: true; daten: Projektdatei; verworfen: string[] }
  | { ok: false; fehler: string }

const zahl = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null

export function erzeugeProjektdatei(p: { name?: string; building: BuildingParams; systemId: string; statikDaten: StatikDaten; notizen: CADNote[]; artikelWahl?: Record<string, string>; testdaten?: boolean }): Projektdatei {
  return {
    format: PROJEKTDATEI_FORMAT,
    version: PROJEKTDATEI_VERSION,
    name: (p.name || 'CAD-Projekt').slice(0, 120),
    gespeichertAm: new Date().toISOString(),
    ...(p.testdaten ? { testdaten: true } : {}),
    building: p.building,
    systemId: p.systemId,
    statikDaten: bereinigeStatikDaten(p.statikDaten),
    notizen: p.notizen,
    ...(p.artikelWahl && Object.keys(p.artikelWahl).length ? { artikelWahl: p.artikelWahl } : {}),
  }
}

export function liesProjektdatei(text: string): LeseErgebnis {
  let roh: unknown
  try { roh = JSON.parse(text) } catch { return { ok: false, fehler: 'Die Datei ist keine gültige Projektdatei (kein lesbares JSON).' } }
  if (!roh || typeof roh !== 'object') return { ok: false, fehler: 'Die Datei ist leer oder hat ein unbekanntes Format.' }
  const r = roh as Record<string, unknown>
  if (r.format !== PROJEKTDATEI_FORMAT) return { ok: false, fehler: 'Das ist keine SCAFFOLD-OS-CAD-Projektdatei.' }
  if (typeof r.version !== 'number' || r.version > PROJEKTDATEI_VERSION) return { ok: false, fehler: 'Die Datei stammt aus einer neueren Programmversion und kann hier nicht gelesen werden.' }
  const b = r.building
  if (!b || typeof b !== 'object') return { ok: false, fehler: 'In der Datei fehlen die Gebäudedaten.' }
  const g = b as Record<string, unknown>
  const verworfen: string[] = []

  const laenge = zahl(g.lengthM, 0, MAX_MASS_M), breite = zahl(g.widthM, 0, MAX_MASS_M), hoehe = zahl(g.heightM, 0, MAX_MASS_M)
  if (laenge == null || breite == null || hoehe == null) return { ok: false, fehler: `Länge, Breite und Höhe müssen Zahlen zwischen 0 und ${MAX_MASS_M} m sein.` }
  const geschosse = zahl(g.floors, 0, 200)
  const dachform = DACHFORMEN.find((d) => d === g.roofForm) ?? 'flachdach'
  if (dachform !== g.roofForm) verworfen.push('Dachform')

  const gebaeude: BuildingParams = {
    lengthM: laenge, widthM: breite, heightM: hoehe,
    eavesHeightM: zahl(g.eavesHeightM, 0, MAX_MASS_M) ?? hoehe,
    roofHeightM: zahl(g.roofHeightM, 0, MAX_MASS_M) ?? 0,
    roofForm: dachform,
    floors: geschosse != null ? Math.round(geschosse) : 0,
    floorHeightsM: Array.isArray(g.floorHeightsM) ? g.floorHeightsM.map((x) => zahl(x, 0, 50)).filter((x): x is number => x != null).slice(0, 200) : [],
    windowCount: Math.round(zahl(g.windowCount, 0, 5000) ?? 0),
    doorCount: Math.round(zahl(g.doorCount, 0, 5000) ?? 0),
    balconyCount: Math.round(zahl(g.balconyCount, 0, 500) ?? 0),
    overhangM: zahl(g.overhangM, 0, 10) ?? 0,
    setbackM: zahl(g.setbackM, 0, 10) ?? 0,
    sides: Array.isArray(g.sides) ? SEITEN.filter((s) => (g.sides as unknown[]).includes(s)) : ['front'],
  }
  if (gebaeude.sides.length === 0) gebaeude.sides = ['front']
  const lk = zahl(g.lastklasse, 1, 6)
  if (lk != null) gebaeude.lastklasse = Math.round(lk)
  if (g.dachrandSchutz === true) gebaeude.dachrandSchutz = true

  if (Array.isArray(g.umriss) && g.umriss.length >= 3 && g.umriss.length <= MAX_PUNKTE) {
    const pkt = g.umriss.map((p) => {
      const o = p as Record<string, unknown>
      const x = zahl(o?.x, -MAX_MASS_M, MAX_MASS_M), z = zahl(o?.z, -MAX_MASS_M, MAX_MASS_M)
      return x != null && z != null ? { x, z } : null
    })
    if (pkt.every((p) => p != null)) gebaeude.umriss = pkt as { x: number; z: number }[]
    else verworfen.push('Umriss')
  }
  if (Array.isArray(g.sections) && g.sections.length >= 2 && g.sections.length <= MAX_ABSCHNITTE) {
    const abs = g.sections.map((s): BuildingSection | null => {
      const o = s as Record<string, unknown>
      const l = zahl(o?.laengeM, 0.1, MAX_MASS_M), h = zahl(o?.hoeheM, 0.1, MAX_MASS_M)
      if (l == null || h == null) return null
      const a: BuildingSection = { laengeM: l, hoeheM: h }
      if (typeof o.bezeichnung === 'string') a.bezeichnung = o.bezeichnung.slice(0, 80)
      const w = zahl(o.winkelGrad, -180, 180); if (w != null) a.winkelGrad = w
      const rf = DACHFORMEN.find((d) => d === o.roofForm); if (rf) a.roofForm = rf
      const rh = zahl(o.roofHoeheM, 0, MAX_MASS_M); if (rh != null) a.roofHoeheM = rh
      if (o.geruest === false) a.geruest = false
      const td = zahl(o.tiefeM, 1, MAX_MASS_M); if (td != null) a.tiefeM = td
      const vs = zahl(o.versatzM, -MAX_MASS_M, MAX_MASS_M); if (vs != null) a.versatzM = vs
      if (o.helmGeruest === true) a.helmGeruest = true
      if (o.geruestAbHoeheM && typeof o.geruestAbHoeheM === 'object') {
        const ab: NonNullable<BuildingSection['geruestAbHoeheM']> = {}
        for (const k of ['front', 'back', 'left', 'right'] as const) { const v = zahl((o.geruestAbHoeheM as Record<string, unknown>)[k], 0.1, MAX_MASS_M); if (v != null) ab[k] = v }
        if (Object.keys(ab).length) a.geruestAbHoeheM = ab
      }
      return a
    })
    if (abs.every((a) => a != null)) gebaeude.sections = abs as BuildingSection[]
    else verworfen.push('Abschnitte')
  }
  if (g.geruestOptionen && typeof g.geruestOptionen === 'object') {
    const o = g.geruestOptionen as Record<string, unknown>
    const opt: NonNullable<BuildingParams['geruestOptionen']> = {}
    const bm = zahl(o.breiteM, 0.1, 5); if (bm != null) opt.breiteM = bm
    const wa = zahl(o.wandabstandM, 0, 5); if (wa != null) opt.wandabstandM = wa
    const fl = zahl(o.feldlaengeM, 0.1, 10); if (fl != null) opt.feldlaengeM = fl
    if (typeof o.treppe === 'boolean') opt.treppe = o.treppe
    if (Object.keys(opt).length) gebaeude.geruestOptionen = opt
  }
  for (const k of ['balconies']) if (g[k] != null) verworfen.push('Balkone')

  let systemId = typeof r.systemId === 'string' ? r.systemId : ''
  if (!findeSystem(systemId)) { if (systemId) verworfen.push('Gerüstsystem (unbekannt, Standard gesetzt)'); systemId = 'layher-allround' }

  const notizen: CADNote[] = Array.isArray(r.notizen)
    ? r.notizen.slice(0, MAX_NOTIZEN).flatMap((n) => {
        const o = n as Record<string, unknown>
        if (typeof o?.id !== 'string' || typeof o.componentId !== 'string' || typeof o.text !== 'string') return []
        return [{ id: o.id.slice(0, 80), componentId: o.componentId.slice(0, 80), componentName: String(o.componentName ?? '').slice(0, 120), componentType: String(o.componentType ?? '').slice(0, 40), text: o.text.slice(0, 2000), createdAt: String(o.createdAt ?? '').slice(0, 40) }]
      })
    : []

  const artikelWahl: Record<string, string> = {}
  if (r.artikelWahl && typeof r.artikelWahl === 'object') {
    for (const [k, v] of Object.entries(r.artikelWahl as Record<string, unknown>).slice(0, MAX_ARTIKELWAHL)) {
      if (typeof v === 'string' && /^[A-Za-z0-9-]{1,20}$/.test(v) && k.length <= 120) artikelWahl[k] = v
    }
  }

  return {
    ok: true,
    verworfen,
    daten: {
      format: PROJEKTDATEI_FORMAT, version: PROJEKTDATEI_VERSION,
      name: typeof r.name === 'string' ? r.name.slice(0, 120) : 'CAD-Projekt',
      gespeichertAm: typeof r.gespeichertAm === 'string' ? r.gespeichertAm.slice(0, 40) : '',
      ...(r.testdaten === true ? { testdaten: true } : {}),
      building: gebaeude, systemId,
      statikDaten: bereinigeStatikDaten(r.statikDaten),
      notizen,
      ...(Object.keys(artikelWahl).length ? { artikelWahl } : {}),
    },
  }
}
