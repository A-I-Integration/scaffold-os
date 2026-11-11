// ============================================================
// SCAFFOLD OS – CAD-Projektdatei (speichern und wieder laden)
//
// Eine Textdatei (JSON) mit allem, was das CAD zum Wiederaufbau braucht:
// Gebäude, Gerüstsystem, Angaben für den Statiker, Notizen. Beim Laden wird
// jedes Feld geprüft; Unbekanntes oder Ungültiges wird verworfen, nie blind
// übernommen. Die Datei enthält KEINE Berechnung und keinen Standsicherheitsnachweis.
// ============================================================

import { istHaubenForm } from '@/lib/cad/haube'
import type { BereichsAenderung } from '@/lib/cad/bereiche'
import { leseFiguren, type Figur } from '@/lib/cad/zeichnung'
import type { BuildingParams, BuildingSection, CadTuer, CadFenster, CadVorbau } from '@/lib/calculations/cad-engine'
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
  /** Von Hand geänderte Gerüstbereiche (Felder angehängt, Bereich aufgestockt) – ältere Dateien haben sie nicht */
  bereiche?: BereichsAenderung[]
  /** Freie Zeichnung im Grundriss (Linien, Kreise, Maße) */
  zeichnung?: Figur[]
}

export type LeseErgebnis =
  | { ok: true; daten: Projektdatei; verworfen: string[] }
  | { ok: false; fehler: string }

const zahl = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null

export function erzeugeProjektdatei(p: { name?: string; building: BuildingParams; systemId: string; statikDaten: StatikDaten; notizen: CADNote[]; artikelWahl?: Record<string, string>; bereiche?: BereichsAenderung[]; zeichnung?: Figur[]; testdaten?: boolean }): Projektdatei {
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
    ...(p.bereiche && p.bereiche.length ? { bereiche: p.bereiche } : {}),
    ...(p.zeichnung && p.zeichnung.length ? { zeichnung: p.zeichnung } : {}),
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
  if (Array.isArray(g.seitenAbBoden)) { const ab = SEITEN.filter((s) => (g.seitenAbBoden as unknown[]).includes(s)); if (ab.length) gebaeude.seitenAbBoden = ab }
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
      if (istHaubenForm(o.haube)) a.haube = o.haube
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
    if (o.wandabstandSeiteM && typeof o.wandabstandSeiteM === 'object') {
      const m = o.wandabstandSeiteM as Record<string, unknown>
      const sm: NonNullable<typeof opt.wandabstandSeiteM> = {}
      for (const sd of ['front', 'back', 'left', 'right'] as const) { const v = zahl(m[sd], 0, 5); if (v != null) sm[sd] = v }
      if (Object.keys(sm).length > 0) opt.wandabstandSeiteM = sm
    }
    const fl = zahl(o.feldlaengeM, 0.1, 10); if (fl != null) opt.feldlaengeM = fl
    if (typeof o.treppe === 'boolean') opt.treppe = o.treppe
    if (typeof o.tuerenFreihalten === 'boolean') opt.tuerenFreihalten = o.tuerenFreihalten
    if (o.kederplane && typeof o.kederplane === 'object') {
      const k = o.kederplane as Record<string, unknown>
      const von = zahl(k.vonM, 0, MAX_MASS_M), bis = zahl(k.bisM, 0, MAX_MASS_M)
      if (von != null && bis != null) opt.kederplane = { vonM: von, bisM: bis }
    }
    if (o.dachfang && typeof o.dachfang === 'object') {
      const d = o.dachfang as Record<string, unknown>
      const h = zahl(d.hoeheM, 0.1, 10)
      if (h != null) {
        opt.dachfang = { hoeheM: h }
        const ab = zahl(d.abTraufeM, 0, MAX_MASS_M); if (ab != null) opt.dachfang.abTraufeM = ab
      }
    }
    if (o.aufzug && typeof o.aufzug === 'object') {
      const z = o.aufzug as Record<string, unknown>
      if (z.seite === 'front' || z.seite === 'back' || z.seite === 'left' || z.seite === 'right') {
        const az: NonNullable<typeof opt.aufzug> = { seite: z.seite, gemietet: z.gemietet === true }
        const bis = zahl(z.bisM, 0, MAX_MASS_M); if (bis != null) az.bisM = bis
        const hs = zahl(z.haltestellen, 0, 100); if (hs != null) az.haltestellen = Math.round(hs)
        const k1 = zahl(z.kostenAufbauEur, 0, 1e7); if (k1 != null) az.kostenAufbauEur = k1
        const k2 = zahl(z.kostenVorhaltungJeWocheEur, 0, 1e7); if (k2 != null) az.kostenVorhaltungJeWocheEur = k2
        const k3 = zahl(z.kostenAbbauEur, 0, 1e7); if (k3 != null) az.kostenAbbauEur = k3
        opt.aufzug = az
      }
    }
    if (Object.keys(opt).length) gebaeude.geruestOptionen = opt
  }
  if (Array.isArray(g.tueren) && g.tueren.length > 0 && g.tueren.length <= 200) {
    const liste = g.tueren.flatMap((t, i): CadTuer[] => {
      const o = t as Record<string, unknown>
      const side = o?.side
      const off = zahl(o?.offsetAlongM, -MAX_MASS_M, MAX_MASS_M), b = zahl(o?.widthM, 0.3, 10), h = zahl(o?.heightM, 0.5, 10)
      if ((side !== 'front' && side !== 'back' && side !== 'left' && side !== 'right') || off == null || b == null || h == null) return []
      const tuer: CadTuer = { id: typeof o.id === 'string' && o.id.length <= 40 ? o.id : `t${i}`, side, offsetAlongM: off, widthM: b, heightM: h }
      if (o.aufschlag === 'innen' || o.aufschlag === 'aussen') tuer.aufschlag = o.aufschlag
      if (o.fluegel === 1 || o.fluegel === 2) tuer.fluegel = o.fluegel
      if (o.anschlag === 'minus' || o.anschlag === 'plus') tuer.anschlag = o.anschlag
      if (o.ueberbauen === true) tuer.ueberbauen = true
      if (o.durchfahrt === true) tuer.durchfahrt = true
      return [tuer]
    })
    if (liste.length === g.tueren.length) gebaeude.tueren = liste
    else verworfen.push('Türen (ungültige Angaben)')
  }
  if (Array.isArray(g.fensterFest) && g.fensterFest.length > 0 && g.fensterFest.length <= 500) {
    const liste = g.fensterFest.flatMap((t, i): CadFenster[] => {
      const o = t as Record<string, unknown>
      const side = o?.side
      const off = zahl(o?.offsetAlongM, -MAX_MASS_M, MAX_MASS_M), unten = zahl(o?.bottomY, -5, MAX_MASS_M)
      const b = zahl(o?.widthM, 0.2, 10), h = zahl(o?.heightM, 0.2, 10), fl = zahl(o?.floorIndex, 0, 100)
      if ((side !== 'front' && side !== 'back' && side !== 'left' && side !== 'right') || off == null || unten == null || b == null || h == null || fl == null) return []
      return [{ id: typeof o.id === 'string' && o.id.length <= 40 ? o.id : `f${i}`, side, offsetAlongM: off, bottomY: unten, widthM: b, heightM: h, floorIndex: Math.round(fl) }]
    })
    if (liste.length === g.fensterFest.length) gebaeude.fensterFest = liste
    else verworfen.push('Fenster (ungültige Angaben)')
  }
  if (Array.isArray(g.vorbauten) && g.vorbauten.length > 0 && g.vorbauten.length <= 50) {
    const liste = g.vorbauten.flatMap((t, i): CadVorbau[] => {
      const o = t as Record<string, unknown>
      const side = o?.side
      const off = zahl(o?.offsetAlongM, -MAX_MASS_M, MAX_MASS_M), b = zahl(o?.breiteM, 0.3, MAX_MASS_M), tf = zahl(o?.tiefeM, 0.3, 30), h = zahl(o?.hoeheM, 0.5, MAX_MASS_M)
      if ((side !== 'front' && side !== 'back' && side !== 'left' && side !== 'right') || off == null || b == null || tf == null || h == null) return []
      return [{ id: typeof o.id === 'string' && o.id.length <= 40 ? o.id : `v${i}`, side, offsetAlongM: off, breiteM: b, tiefeM: tf, hoeheM: h }]
    })
    if (liste.length === g.vorbauten.length) gebaeude.vorbauten = liste
    else verworfen.push('Vorbauten (ungültige Angaben)')
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

  const bereiche: BereichsAenderung[] = []
  if (Array.isArray(r.bereiche)) {
    for (const x of r.bereiche.slice(0, 100)) {
      const o = x as Record<string, unknown>
      const seite = o?.seite
      if (seite !== 'front' && seite !== 'back' && seite !== 'left' && seite !== 'right') { verworfen.push('Bereichsänderung (ungültige Seite)'); continue }
      if (o.art === 'erweitern') {
        const anzahl = zahl(o.anzahl, 1, 40)
        const fl = o.feldlaengeM === undefined ? undefined : zahl(o.feldlaengeM, 0.5, 5)
        const lg = o.lagen === undefined ? undefined : zahl(o.lagen, 1, 100)
        if (anzahl == null || (o.ende !== 'anfang' && o.ende !== 'ende') || fl === null || lg === null) { verworfen.push('Bereichsänderung (ungültige Angaben)'); continue }
        bereiche.push({ art: 'erweitern', seite, ende: o.ende, anzahl: Math.floor(anzahl), ...(fl ? { feldlaengeM: fl } : {}), ...(lg ? { lagen: Math.floor(lg) } : {}) })
      } else if (o.art === 'laenge') {
        const spalte = zahl(o.spalte, 0, 199)
        const fl = zahl(o.feldlaengeM, 0.5, 5)
        if (spalte == null || fl == null) { verworfen.push('Bereichsänderung (ungültige Angaben)'); continue }
        bereiche.push({ art: 'laenge', seite, spalte: Math.floor(spalte), feldlaengeM: fl })
      } else if (o.art === 'aufstocken') {
        const lagen = zahl(o.lagen, 1, 10)
        const von = o.vonM === undefined ? undefined : zahl(o.vonM, 0, MAX_MASS_M)
        const bis = o.bisM === undefined ? undefined : zahl(o.bisM, 0, MAX_MASS_M)
        if (lagen == null || von === null || bis === null) { verworfen.push('Bereichsänderung (ungültige Angaben)'); continue }
        const kante = o.kante === undefined ? undefined : zahl(o.kante, 0, 199)
        if (kante === null) { verworfen.push('Bereichsänderung (ungültige Kante)'); continue }
        bereiche.push({ art: 'aufstocken', seite, ...(kante !== undefined ? { kante: Math.floor(kante) } : {}), lagen: Math.floor(lagen), ...(von !== undefined ? { vonM: von } : {}), ...(bis !== undefined ? { bisM: bis } : {}) })
      } else verworfen.push('Bereichsänderung (unbekannte Art)')
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
      ...(bereiche.length ? { bereiche } : {}),
      ...(leseFiguren(r.zeichnung).length ? { zeichnung: leseFiguren(r.zeichnung) } : {}),
    },
  }
}
