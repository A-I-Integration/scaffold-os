// ============================================================
// SCAFFOLD OS – Aufmaß → CAD
//
// Rechnet die Angaben aus dem Aufmaß (Schritt 1–3, ggf. gespeichertes
// kiResult.building) in die Gebäudeparameter des CAD um, damit ein Knopf
// im Aufmaß das Gebäude samt Gerüst direkt im CAD (3D-Ansicht) öffnet.
//
// Regeln (gelten für jedes Aufmaß, nicht für einzelne Dateien):
//  • Stammt das Projekt aus dem CAD (kiResult.building vorhanden), wird
//    dieses Gebäude 1:1 übernommen – verlustfrei.
//  • Sonst wird aus Schritt 2 gebaut. Das Aufmaß rechnet die Gerüstfläche
//    als Länge × Höhe (je Abschnitt). Das CAD bekommt deshalb dieselbe
//    Länge auf EINER Seite (sides = ['front']) – so stimmen Fläche und
//    Stückliste mit dem Aufmaß überein. Weitere Seiten schaltet man im
//    CAD zu.
//  • Fehlende Pflichtmaße (Länge, Breite/Tiefe, Höhe) werden gemeldet,
//    nicht erfunden.
// ============================================================

import type { BuildingParams, BuildingSection } from '@/lib/calculations/cad-engine'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'

export interface AufmassFuerCad {
  step2?: Record<string, unknown>
  step3?: Record<string, unknown>
  /** Gespeichertes KI-/CAD-Ergebnis des Projekts; nur building und systemId werden gelesen */
  kiResult?: object | null
}

export interface CadUebernahme {
  ok: boolean
  building?: BuildingParams
  systemId: string
  /** Fehlende Pflichtmaße (ok = false) */
  fehlend: string[]
  /** Hinweise zu Annahmen, an den Nutzer zeigen */
  hinweise: string[]
}

const DACH: Record<string, BuildingParams['roofForm']> = {
  satteldach: 'satteldach', flachdach: 'flachdach', pultdach: 'pultdach', walmdach: 'walmdach',
  mansarddach: 'mansardendach', mansardendach: 'mansardendach', zeltdach: 'walmdach', kein: 'kein',
}

const zahl = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function aufmassZuCad(a: AufmassFuerCad): CadUebernahme {
  const hinweise: string[] = []
  const ki = a.kiResult as { building?: Record<string, unknown>; systemId?: string } | null | undefined
  const sysId = (id: unknown) => (typeof id === 'string' && GERUEST_SYSTEME.some((s) => s.id === id) ? id : '')

  // 1) Projekt kam aus dem CAD → Gebäude unverändert zurück
  if (ki?.building && zahl(ki.building.lengthM) > 0 && zahl(ki.building.widthM) > 0 && zahl(ki.building.heightM) > 0) {
    return { ok: true, building: ki.building as unknown as BuildingParams, systemId: sysId(ki.systemId) || sysId(a.step3?.system) || 'layher-allround', fehlend: [], hinweise: ['Gebäude unverändert aus der CAD-Planung dieses Projekts übernommen.'] }
  }

  // 2) Aus Schritt 2 aufbauen
  const s2 = (a.step2 || {}) as Record<string, unknown>
  const laenge = zahl(s2.laenge)
  const breite = zahl(s2.breite)
  const hoehe = zahl(s2.hoehe)
  const fehlend: string[] = []
  if (!laenge) fehlend.push('Länge')
  if (!breite) fehlend.push('Breite/Tiefe des Gebäudes')
  if (!hoehe) fehlend.push('Höhe')

  const systemId = sysId(a.step3?.system) || 'layher-allround'
  if (!sysId(a.step3?.system)) hinweise.push('Das Gerüstsystem aus dem Aufmaß ist im CAD nicht hinterlegt – es wurde Layher Allround gesetzt, bitte prüfen.')
  if (fehlend.length) return { ok: false, systemId, fehlend, hinweise }

  const traufe = zahl(s2.traufhoehe)
  const dachform = DACH[String(s2.dachform || '').toLowerCase()] ?? 'flachdach'
  if (s2.dachform && !DACH[String(s2.dachform).toLowerCase()]) hinweise.push(`Dachform „${s2.dachform}“ ist im CAD nicht vorhanden – Flachdach gesetzt.`)

  const roofHeightM = dachform !== 'flachdach' && dachform !== 'kein' && traufe > 0 && traufe < hoehe ? Math.round((hoehe - traufe) * 100) / 100 : 0
  if (dachform !== 'flachdach' && dachform !== 'kein' && roofHeightM === 0) hinweise.push('Traufhöhe fehlt oder ist nicht kleiner als die Höhe – Dachhöhe im CAD auf 0 gesetzt, bitte ergänzen.')

  const zusatz: BuildingSection[] = (Array.isArray(s2.abschnitte) ? (s2.abschnitte as Record<string, unknown>[]) : [])
    .filter((x) => zahl(x?.laenge) > 0 && zahl(x?.hoehe) > 0)
    .map((x, i: number) => ({ bezeichnung: (x.bezeichnung as string) || `Abschnitt ${i + 2}`, laengeM: zahl(x.laenge), hoeheM: zahl(x.hoehe) }))
  const sections: BuildingSection[] | undefined = zusatz.length > 0
    ? [{ bezeichnung: 'Abschnitt 1', laengeM: laenge, hoeheM: hoehe }, ...zusatz]
    : undefined
  if (sections) hinweise.push('Die Abschnitte liegen im CAD in einer Reihe (gerade). Ecken/Winkel im CAD unter „Abschnitte“ einstellen.')

  const balkone = (Array.isArray(s2.balkone) ? (s2.balkone as Record<string, unknown>[]) : []).reduce((s: number, b) => s + Math.max(1, Math.round(zahl(b?.anzahl) || 1)), 0)

  const building: BuildingParams = {
    lengthM: laenge, widthM: breite, heightM: hoehe,
    eavesHeightM: traufe || hoehe, roofHeightM, roofForm: dachform,
    floors: 0, floorHeightsM: [],
    windowCount: 0, doorCount: 0, balconyCount: balkone,
    overhangM: zahl(s2.dachueberstand) || 0, setbackM: 0,
    sides: ['front'],
    ...(sections ? { sections } : {}),
  }
  hinweise.push('Das Gerüst steht wie im Aufmaß auf einer Seite (Länge × Höhe). Weitere Seiten im CAD zuschalten. Fenster und Türen sind im Aufmaß nicht erfasst – bei Bedarf im CAD ergänzen.')
  return { ok: true, building, systemId, fehlend: [], hinweise }
}

/** Zwischenablage zwischen Aufmaß-Seite und CAD (nur dieser Browser-Tab). */
export const CAD_UEBERNAHME_KEY = 'scaffold_cad_aus_aufmass'

export interface CadUebergabe { building: BuildingParams; systemId: string; hinweise: string[]; projektName?: string }

export function leseCadUebergabe(roh: string | null): CadUebergabe | null {
  if (!roh) return null
  try {
    const j = JSON.parse(roh) as Record<string, unknown> & { building?: BuildingParams }
    const b = j?.building
    if (!b || !(b.lengthM > 0) || !(b.widthM > 0) || !(b.heightM > 0)) return null
    return { building: b, systemId: typeof j.systemId === 'string' ? j.systemId : 'layher-allround', hinweise: Array.isArray(j.hinweise) ? (j.hinweise as unknown[]).map(String) : [], projektName: typeof j.projektName === 'string' ? j.projektName : undefined }
  } catch { return null }
}
