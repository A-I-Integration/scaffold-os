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
import type { MaterialItem } from '@/types/scaffold'
import type { PlanImport } from '@/lib/cad/plan-import'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import { breiteVonBreitenklasse } from '@/lib/geruestklassen'

export interface AufmassFuerCad {
  step2?: Record<string, unknown>
  step3?: Record<string, unknown>
  /** Gespeichertes KI-/CAD-Ergebnis des Projekts; nur building und systemId werden gelesen */
  kiResult?: object | null
  /** Originaler Vektor-PDF-Import mit allen Geschosskonturen und Höhenvorschlägen. */
  planImport?: PlanImport | null
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

/** Lastklasse (1–6) und Breitenklasse (W06 …) aus Schritt 2 → Gebäudeparameter des CAD.
 *  Die Gerüstbreite wird nur gesetzt, wenn das System eine Breite hat, die mindestens der Breitenklasse entspricht. */
function klassenUebernehmen(s2: Record<string, unknown>, systemId: string, b: BuildingParams, hinweise: string[]): void {
  const lk = Math.round(Number(s2.lastklasse))
  if (Number.isFinite(lk) && lk >= 1 && lk <= 6) {
    if (b.lastklasse !== undefined && b.lastklasse !== lk) hinweise.push(`Lastklasse: CAD ${b.lastklasse} → Aufmaß ${lk}`)
    b.lastklasse = lk
  }
  const bk = typeof s2.breitenklasse === 'string' ? s2.breitenklasse.trim().toUpperCase() : ''
  const min = breiteVonBreitenklasse(bk)
  if (min) {
    const sys = GERUEST_SYSTEME.find((x) => x.id === systemId)
    const passend = sys?.rahmenBreitenM.filter((w) => w >= min - 1e-9).sort((x, y) => x - y)[0]
    if (passend) b.geruestOptionen = { ...(b.geruestOptionen ?? {}), breiteM: passend }
    else hinweise.push(`Breitenklasse ${bk} aus dem Aufmaß: Das gewählte System hat keine passende Gerüstbreite – bitte im CAD prüfen.`)
  }
}

export function aufmassZuCad(a: AufmassFuerCad): CadUebernahme {
  const hinweise: string[] = []
  const ki = a.kiResult as { building?: Record<string, unknown>; systemId?: string } | null | undefined
  const sysId = (id: unknown) => (typeof id === 'string' && GERUEST_SYSTEME.some((s) => s.id === id) ? id : '')
  const planDatenUebernehmen = (b: BuildingParams): void => {
    const geschosse = a.planImport?.geschosse ?? []
    b.planGeschossKonturen = geschosse
      .filter((g) => g.ebene >= 0 && Array.isArray(g.umriss) && g.umriss.length >= 3)
      .map((g) => ({ ebene: g.ebene, titel: g.titel, umriss: g.umriss! }))
    b.planGeschossHoehenVorschlaege = (a.planImport?.geschossHoehenVorschlaege ?? [])
      .filter((v) => geschosse.some((g) => g.ebene === v.ebene && Array.isArray(g.umriss) && g.umriss.length >= 3))
      .map((v) => ({ ...v, bestaetigungErforderlich: true as const }))
    if (b.planGeschossKonturen.length) hinweise.push(`${b.planGeschossKonturen.length} PDF-Geschosskontur(en) an CAD übergeben; Höhen bleiben bis zur manuellen Bestätigung Vorschläge.`)
    else if (a.planImport) hinweise.push('PDF-Import vorhanden, aber keine vollständigen Geschosskonturen für die CAD-Fassadenanalyse gefunden.')
  }

  // 1) Projekt kam aus dem CAD → das gespeicherte Gebäude ist die Grundlage (enthält Umriss, Optionen, Balkone, Türen …).
  //    Wurde das Aufmaß danach geändert, haben die Aufmaß-Werte Vorrang – sonst käme die Änderung nie im CAD an.
  if (ki?.building && zahl(ki.building.lengthM) > 0 && zahl(ki.building.widthM) > 0 && zahl(ki.building.heightM) > 0) {
    const gespeichert = ki.building as unknown as BuildingParams
    const sid = sysId(ki.systemId) || sysId(a.step3?.system) || 'mj-uniconnect'
    const s2k = (a.step2 || {}) as Record<string, unknown>
    const b: BuildingParams = { ...gespeichert }
    planDatenUebernehmen(b)
    const hw: string[] = []
    const mitUmriss = (gespeichert.umriss?.length ?? 0) >= 3
    const setze = (feld: 'lengthM' | 'widthM' | 'heightM' | 'eavesHeightM' | 'overhangM', wert: number, name: string) => {
      if (!(wert > 0) || Math.abs((gespeichert[feld] ?? 0) - wert) < 0.005) return
      hw.push(`${name}: CAD ${gespeichert[feld] ?? 0} m → Aufmaß ${wert} m`)
      b[feld] = wert
    }
    if (!mitUmriss) {
      setze('lengthM', zahl(s2k.laenge), 'Länge'); setze('widthM', zahl(s2k.breite), 'Breite/Tiefe'); setze('heightM', zahl(s2k.hoehe), 'Höhe')
    }
    setze('eavesHeightM', zahl(s2k.traufhoehe), 'Traufhöhe'); setze('overhangM', zahl(s2k.dachueberstand), 'Dachüberstand')
    const df = DACH[String(s2k.dachform || '').toLowerCase()]
    if (df && df !== gespeichert.roofForm) { hw.push(`Dachform: CAD ${gespeichert.roofForm} → Aufmaß ${df}`); b.roofForm = df }
    const zus = (Array.isArray(s2k.abschnitte) ? (s2k.abschnitte as Record<string, unknown>[]) : []).filter((x) => zahl(x?.laenge) > 0 && zahl(x?.hoehe) > 0)
    if (zus.length > 0 && !mitUmriss) {
      b.sections = [{ bezeichnung: 'Abschnitt 1', laengeM: b.lengthM, hoeheM: b.heightM }, ...zus.map((x, i) => ({ bezeichnung: (x.bezeichnung as string) || `Abschnitt ${i + 2}`, laengeM: zahl(x.laenge), hoeheM: zahl(x.hoehe) }))]
      hw.push('Abschnitte aus dem Aufmaß übernommen (die CAD-Abschnitte wurden ersetzt).')
    }
    klassenUebernehmen(s2k, sid, b, hw)
    return {
      ok: true, building: b, systemId: sid, fehlend: [],
      hinweise: hw.length > 0
        ? ['Gebäude aus der CAD-Planung dieses Projekts übernommen. Geänderte Aufmaß-Werte haben Vorrang:', ...hw]
        : ['Gebäude unverändert aus der CAD-Planung dieses Projekts übernommen (Aufmaß und CAD stimmen überein).'],
    }
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

  const systemId = sysId(a.step3?.system) || 'mj-uniconnect'
  if (!sysId(a.step3?.system)) hinweise.push(a.step3?.system ? 'Das Gerüstsystem aus dem Aufmaß ist im CAD nicht hinterlegt – es wurde Layher Allround gesetzt, bitte prüfen.' : 'Im Aufmaß ist kein Gerüstsystem gewählt (herstellerneutral) – im CAD wurde Layher Allround gesetzt, bitte prüfen.')
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
    windowCount: 0, doorCount: Math.max(0, Math.round(zahl(s2.hauseingaenge))), balconyCount: balkone,
    overhangM: zahl(s2.dachueberstand) || 0, setbackM: 0,
    sides: ['front'],
    ...(sections ? { sections } : {}),
  }
  planDatenUebernehmen(building)
  klassenUebernehmen(s2, systemId, building, hinweise)
  hinweise.push('Das Gerüst steht wie im Aufmaß auf einer Seite (Länge × Höhe). Weitere Seiten im CAD zuschalten. Fenster sind im Aufmaß nicht erfasst – bei Bedarf im CAD ergänzen.')
  return { ok: true, building, systemId, fehlend: [], hinweise }
}

/** Zwischenablage zwischen Aufmaß-Seite und CAD (nur dieser Browser-Tab). */
export const CAD_UEBERNAHME_KEY = 'scaffold_cad_aus_aufmass'

export interface CadUebergabe { building: BuildingParams; systemId: string; hinweise: string[]; projektName?: string; notizen?: unknown[]; statikDaten?: Record<string, unknown>; /** Stückliste des Aufmaßes (für die Regel „Größeres von beiden“) */ aufmassListe?: MaterialItem[] }

/** Nur Zeilen mit Artikelnummer, Menge und Stückpreis übernehmen */
export function gueltigeStueckliste(roh: unknown): MaterialItem[] | undefined {
  if (!Array.isArray(roh)) return undefined
  const l = roh.filter((i): i is MaterialItem => !!i && typeof i === 'object' && typeof (i as MaterialItem).articleNumber === 'string' && Number.isFinite((i as MaterialItem).quantity) && (i as MaterialItem).quantity >= 0 && Number.isFinite((i as MaterialItem).unitPrice))
  return l.length ? l : undefined
}

export function leseCadUebergabe(roh: string | null): CadUebergabe | null {
  if (!roh) return null
  try {
    const j = JSON.parse(roh) as Record<string, unknown> & { building?: BuildingParams }
    const b = j?.building
    if (!b || !(b.lengthM > 0) || !(b.widthM > 0) || !(b.heightM > 0)) return null
    return { building: b, systemId: typeof j.systemId === 'string' ? j.systemId : 'mj-uniconnect', hinweise: Array.isArray(j.hinweise) ? (j.hinweise as unknown[]).map(String) : [], projektName: typeof j.projektName === 'string' ? j.projektName : undefined, notizen: Array.isArray(j.notizen) ? j.notizen : undefined, statikDaten: j.statikDaten && typeof j.statikDaten === 'object' && !Array.isArray(j.statikDaten) ? (j.statikDaten as Record<string, unknown>) : undefined, aufmassListe: gueltigeStueckliste(j.aufmassListe) }
  } catch { return null }
}
