// ============================================================
// SCAFFOLD OS – IFC lesen: BIM-Modell → Geschosse, Umriss, Gebäudeteile (reine Geometrie, keine KI)
//
// Ablauf:
//   1. Datei prüfen: Größe (hartes Limit), STEP-Kopf und -Ende (abgeschnittene Dateien werden abgelehnt).
//   2. web-ifc (WebAssembly, läuft im Browser) öffnet das Modell. Gelesen werden IfcBuildingStorey (Name, Elevation),
//      die Längeneinheit des Projekts und die Zuordnung Bauteil → Geschoss (IfcRelContainedInSpatialStructure).
//   3. Geometrie nur der Bauteile, die den Grundriss bestimmen: Wände (je Geschoss), ersatzweise Decken; Dächer nur
//      zur Information. Die Dreiecke werden von oben projiziert und je Geschoss zu einer Außenkontur vereinigt
//      (ifc-grundriss.ts).
//   4. Die Konturen gehen durch DIESELBE Formerkennung wie bei DXF (dxf-umriss.ts → umrissAusFiguren): Ecken, Form,
//      Teile, Anbauten. Teile tragen quelle 'ifc'.
//   5. Höhe je Teil: Oberkante der Wände im höchsten Geschoss, das den Teil überdeckt, gemessen vom Gelände
//      (= unterstes Geschoss ab -0,5 m Elevation). Das ist ein VORSCHLAG mit Quellenangabe im Hinweis des Teils;
//      die Person kann ihn überschreiben (mitHoehen).
//
// Fehlerverhalten: nie ein halber Import. Entweder ein vollständiges Ergebnis oder { ok: false, grund, meldung }.
// Die KI wird für IFC nie gefragt (kein fallbackKi).
//
// Grenzen (ehrlich): Die Dachform wird nicht gelesen (flachdach, Hinweis); Traufhöhe = Wandoberkante, bei Giebelwänden
// kann sie höher liegen als die Traufe. Parsen läuft synchron im WebAssembly-Speicher des Browsers und kann nicht
// unterbrochen werden – deshalb das Größenlimit. Geometrie wird in Stapeln gelesen, zwischen den Stapeln bekommt die
// Oberfläche Luft und der Fortschritt wird gemeldet.
// ============================================================
import type * as WebIFCTypen from 'web-ifc'
import * as rahmenJs from '../../workers/ki/ifc-rahmen.js'
import * as ifcLesen from '../../workers/ki/ifc-lesen.js'
import { umrissAusFiguren, teilPunktInQuelle, type DxfUmrissErgebnis } from '@/lib/cad/dxf-umriss'
import type { GebaeudeTeil } from '@/lib/cad/modell-analyse'
import {
  aussenkonturen, flaecheM2, fuelleDreiecke, fuelleLoecher, inMaske, neueMaske, oderMaske, rasterFuer, type Punkt2, type Raster,
} from '@/lib/cad/ifc-grundriss'

/** Hartes Limit für den Browser-Import (Annahme: web-ifc braucht beim Öffnen ein Mehrfaches der Dateigröße an WASM-Speicher). */
export const IFC_MAX_BYTES = 200 * 1024 * 1024
/** Ab dieser Größe wird gewarnt, dass das Lesen dauern kann. */
export const IFC_WARN_BYTES = 50 * 1024 * 1024
const BLOCK_BYTES = 8 * 1024 * 1024
const STAPEL = 40

export type IfcFehlerGrund = 'zu-gross' | 'kein-ifc' | 'kaputt' | 'wasm' | 'keine-geschosse' | 'keine-geometrie' | 'umriss-unbrauchbar' | 'abgebrochen'

export interface IfcFehlschlag {
  ok: false
  grund: IfcFehlerGrund
  /** Fertiger Satz für die Person */
  meldung: string
  hinweise: string[]
  /** Für IFC immer false: die KI wird nie gefragt */
  fallbackKi: false
}

export interface IfcGeschoss {
  name: string
  /** Elevation laut IfcBuildingStorey in Metern */
  elevationM: number
  /** Untergeschoss (Elevation unter -0,5 m): wird für Umriss und Höhen nicht verwendet */
  unterirdisch: boolean
  /** Oberkante der Wände dieses Geschosses über dem Gelände in Metern; null, wenn das Geschoss keine Wandgeometrie hat */
  oberkanteM: number | null
  waende: number
  /** Grundrissfläche (Wände vereinigt, Löcher gefüllt) in m² */
  flaecheM2: number
}

export type IfcZusatz = {
  geschosse: IfcGeschoss[]
  /** Elevation des Geländes (unterstes Geschoss ab -0,5 m) in Metern, wie in der Datei */
  gelaendeElevationM: number
  dateiBytes: number
  schema: string
}
export type IfcErgebnis = DxfUmrissErgebnis & IfcZusatz
export type IfcLeseErgebnis = IfcErgebnis | IfcFehlschlag

export type IfcEingabe = Blob | ArrayBuffer | Uint8Array

export interface IfcOptionen {
  /** Anteil 0…1 und Text zur aktuellen Phase */
  onFortschritt?: (anteil: number, text: string) => void
  maxBytes?: number
  signal?: AbortSignal
}

const fehler = (grund: IfcFehlerGrund, meldung: string, hinweise: string[] = []): IfcFehlschlag => ({ ok: false, grund, meldung, hinweise, fallbackKi: false })
const mb = (b: number) => (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')
const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',')
const pause = () => new Promise<void>((r) => setTimeout(r, 0))

// ---------------------------------------------------------------- web-ifc laden

type Modul = typeof WebIFCTypen
let apiPromise: Promise<{ W: Modul; api: WebIFCTypen.IfcAPI }> | null = null

function ladeApi(): Promise<{ W: Modul; api: WebIFCTypen.IfcAPI }> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const W = (await import('web-ifc')) as Modul
      const api = new W.IfcAPI()
      if (typeof window !== 'undefined') api.SetWasmPath('/wasm/', true)   // public/wasm/web-ifc.wasm; „true“ = absoluter Pfad (sonst sucht web-ifc relativ zum Skript unter /_next/static/chunks/ und findet nichts)
      await api.Init()
      try { api.SetLogLevel(W.LogLevel.LOG_LEVEL_OFF) } catch { /* ältere Versionen */ }
      return { W, api }
    })().catch((e) => { apiPromise = null; throw e })
  }
  return apiPromise
}

// ---------------------------------------------------------------- Datei lesen

async function leseBytes(eingabe: IfcEingabe, opt: IfcOptionen): Promise<Uint8Array> {
  if (eingabe instanceof Uint8Array) return eingabe
  if (eingabe instanceof ArrayBuffer) return new Uint8Array(eingabe)
  const gesamt = eingabe.size
  const out = new Uint8Array(gesamt)
  for (let pos = 0; pos < gesamt; pos += BLOCK_BYTES) {
    if (opt.signal?.aborted) throw new Error('abgebrochen')
    const teil = new Uint8Array(await eingabe.slice(pos, Math.min(gesamt, pos + BLOCK_BYTES)).arrayBuffer())
    out.set(teil, pos)
    opt.onFortschritt?.(0.02 + 0.2 * Math.min(1, (pos + teil.length) / gesamt), `Datei wird gelesen … ${mb(pos + teil.length)} von ${mb(gesamt)} MB`)
    await pause()
  }
  return out
}

// Die Prüfungen liegen in workers/ki/ifc-rahmen.js: dieselbe Logik läuft im Hetzner-Worker (Phase 89), nur eine Quelle.
const rahmenFehler = (f: { grund: string; meldung: string } | null): IfcFehlschlag | null =>
  f ? fehler(f.grund as IfcFehlerGrund, f.meldung) : null

/** Kopf und Ende prüfen: STEP-Datei, vollständig. Gibt einen Fehler zurück oder null. */
export function pruefeIfcRahmen(daten: Uint8Array): IfcFehlschlag | null { return rahmenFehler(rahmenJs.pruefeIfcRahmen(daten)) }

/** Syntaxprüfung des STEP-Datenteils VOR web-ifc (Details in workers/ki/ifc-rahmen.js). */
export function pruefeStepSyntax(daten: Uint8Array): IfcFehlschlag | null { return rahmenFehler(rahmenJs.pruefeStepSyntax(daten)) }

// ---------------------------------------------------------------- Hauptfunktion

interface Bauteil { id: number; art: 'wand' | 'decke' | 'dach'; tris: number[]; yMin: number; yMax: number; geschoss: number }

/**
 * Rohmodell: das, was aus einer IFC-Datei gelesen wird, BEVOR irgendetwas abgeleitet wird. Es kommt entweder aus dem
 * Browser (web-ifc im Tab, `auswerten`) oder aus dem Hetzner-Worker (Properties-JSON, Phase 89). Beide füttern dieselbe
 * Ableitung `leiteIfcAb` (Geschosse, Grundriss, Gebäudeteile, Höhen) – es gibt genau eine Ableitungslogik.
 * Längen in Metern; `tris` = Dreiecke der Grundrissebene (x, y je Ecke, 6 Zahlen je Dreieck), `geschoss` = Index in `geschosse` oder -1.
 */
export interface IfcRohGeschoss { id: number; name: string; elevation: number | null }
export interface IfcRohBauteil { id: number; art: 'wand' | 'decke' | 'dach'; geschoss: number; tris: number[]; yMin: number; yMax: number }
export interface IfcRohmodell {
  schema: string
  dateiBytes: number
  geschosse: IfcRohGeschoss[]
  /** nur Bauteile mit Geometrie */
  bauteile: IfcRohBauteil[]
  /** Anzahl gefundener Wände/Decken/Dächer im Modell (auch ohne lesbare Geometrie) */
  gefunden: { wand: number; decke: number; dach: number }
  /** Hinweise aus dem Lesen (Einheit, mehrere Gebäude, nicht lesbare Bauteile) – stehen vor den Hinweisen der Ableitung */
  hinweise: string[]
}

/** Gemeinsame Prüfung: ohne Wände und Decken lässt sich kein Umriss lesen. */
export function pruefeBauteileGefunden(g: IfcRohmodell['gefunden']): IfcFehlschlag | null {
  return g.wand + g.decke > 0 ? null : fehler('keine-geometrie', 'Im Modell wurden weder Wände noch Decken gefunden (IfcWall, IfcSlab). Daraus lässt sich kein Umriss lesen – bitte als DXF/OBJ exportieren.')
}

export async function leseIfc(eingabe: IfcEingabe, opt: IfcOptionen = {}): Promise<IfcLeseErgebnis> {
  const meld = (a: number, t: string) => opt.onFortschritt?.(a, t)
  const abbruch = () => !!opt.signal?.aborted
  const bytes = eingabe instanceof Uint8Array ? eingabe.byteLength : eingabe instanceof ArrayBuffer ? eingabe.byteLength : eingabe.size
  const limit = opt.maxBytes ?? IFC_MAX_BYTES
  if (bytes > limit) {
    return fehler('zu-gross', `Datei zu groß für Browser-Import (${mb(bytes)} MB, Limit ${mb(limit)} MB), bitte als DXF/OBJ exportieren.`)
  }
  if (bytes === 0) return fehler('kein-ifc', 'Die Datei ist leer.')

  meld(0.01, bytes > IFC_WARN_BYTES ? `Große Datei (${mb(bytes)} MB) – das Lesen kann einige Minuten dauern …` : 'Datei wird gelesen …')
  let daten: Uint8Array
  try { daten = await leseBytes(eingabe, opt) } catch (e) {
    return (e as Error).message === 'abgebrochen' ? fehler('abgebrochen', 'Import abgebrochen.') : fehler('kaputt', 'Die Datei konnte nicht gelesen werden.')
  }
  const rahmenFehler = pruefeIfcRahmen(daten)
  if (rahmenFehler) return rahmenFehler
  const syntaxFehler = pruefeStepSyntax(daten)
  if (syntaxFehler) return syntaxFehler

  let W: Modul, api: WebIFCTypen.IfcAPI
  try { ({ W, api } = await ladeApi()) } catch {
    return fehler('wasm', 'Der IFC-Leser (WebAssembly) konnte nicht geladen werden. Bitte Seite neu laden oder die Datei als DXF/OBJ exportieren.')
  }

  meld(0.24, 'IFC-Modell wird geöffnet …')
  await pause()
  let m = -1
  try {
    m = api.OpenModel(daten)
    if (typeof m !== 'number' || m < 0) throw new Error('OpenModel')
  } catch {
    return fehler('kaputt', 'Die IFC-Datei konnte nicht gelesen werden (beschädigt oder ein nicht unterstütztes Schema). Es wurde nichts importiert.')
  }

  try {
    if (abbruch()) return fehler('abgebrochen', 'Import abgebrochen.')
    return await auswerten(W, api, m, bytes, opt, meld, abbruch)
  } catch (e) {
    return fehler('kaputt', `Die IFC-Datei konnte nicht ausgewertet werden (${(e as Error).message || 'unbekannter Fehler'}). Es wurde nichts importiert.`)
  } finally {
    try { api.CloseModel(m) } catch { /* schon geschlossen */ }
  }
}

async function auswerten(W: Modul, api: WebIFCTypen.IfcAPI, m: number, bytes: number, opt: IfcOptionen, meld: (a: number, t: string) => void, abbruch: () => boolean): Promise<IfcLeseErgebnis> {
  void opt
  // Lesen (Geschosse, Bauteile, Grundriss-Dreiecke): gemeinsamer Code mit dem Hetzner-Worker (workers/ki/ifc-lesen.js)
  const gelesen = await ifcLesen.leseRohmodell(W, api, m, bytes, { stapel: STAPEL, onFortschritt: meld, pause, abbruch, bereich: [0.3, 0.85] })
  if (!gelesen.ok) return fehler(gelesen.grund as IfcFehlerGrund, gelesen.meldung ?? 'Das Modell konnte nicht gelesen werden.')
  return leiteIfcAb(gelesen.roh as IfcRohmodell, meld, abbruch)
}

// ---------------------------------------------------------------- Ableitung (gemeinsam für Browser und Worker)

/**
 * Aus dem Rohmodell werden Geschosse, Außenkontur, Gebäudeteile und Höhen abgeleitet. Reine Rechnung ohne web-ifc:
 * dieselbe Funktion bedient den Browser-Import und den Worker-Import (Properties-JSON).
 */
export async function leiteIfcAb(roh: IfcRohmodell, meld: (a: number, t: string) => void = () => {}, abbruch: () => boolean = () => false): Promise<IfcLeseErgebnis> {
  const keineBauteile = pruefeBauteileGefunden(roh.gefunden)
  if (keineBauteile) return keineBauteile
  if (abbruch()) return fehler('abgebrochen', 'Import abgebrochen.')
  const hinweise: string[] = [...roh.hinweise]
  const bytes = roh.dateiBytes
  const schema = roh.schema
  const rohGeschosse = roh.geschosse
  const bauteile = new Map<number, Bauteil>(roh.bauteile.map((b) => [b.id, { ...b }]))
  const geschossVonBauteil = new Set(roh.bauteile.filter((b) => b.geschoss >= 0).map((b) => b.id))

  // ---- Geschosse ordnen, Gelände bestimmen
  const mitElevation = rohGeschosse.map((g, i) => ({ ...g, i }))
  // fehlende Elevation: Unterkante der zugeordneten Wände als Ersatz (mit Hinweis)
  for (const g of mitElevation) {
    if (g.elevation !== null) continue
    const ys = [...bauteile.values()].filter((b) => b.geschoss === g.i && b.tris.length > 0).map((b) => b.yMin)
    if (ys.length > 0) { g.elevation = Math.min(...ys); hinweise.push(`Geschoss „${g.name}“ hat keine Elevation – ersatzweise die Unterkante seiner Bauteile (${fmt(g.elevation)} m) verwendet.`) }
  }
  const geordnet = mitElevation.filter((g) => g.elevation !== null).sort((a, b) => a.elevation! - b.elevation!)
  if (geordnet.length === 0) return fehler('keine-geschosse', 'Die Geschosse haben keine Elevation und keine Geometrie – Höhen lassen sich nicht lesen. Bitte als DXF/OBJ exportieren.')
  const ueberGelaende = geordnet.filter((g) => g.elevation! >= -0.5)
  const gelaende = (ueberGelaende.length > 0 ? ueberGelaende[0] : geordnet[0]).elevation!
  const unterirdisch = (g: { elevation: number | null }) => ueberGelaende.length > 0 && g.elevation! < -0.5
  // Bauteile ohne Zuordnung: höchstes Geschoss, dessen Elevation unter der Bauteil-Unterkante (+0,3 m) liegt
  for (const b of bauteile.values()) {
    if (b.geschoss >= 0 || b.tris.length === 0) continue
    const passend = [...geordnet].reverse().find((g) => g.elevation! <= b.yMin + 0.3) ?? geordnet[0]
    b.geschoss = passend.i
  }
  const unzugeordnet = [...bauteile.values()].filter((b) => b.tris.length > 0 && !geschossVonBauteil.has(b.id)).length
  if (unzugeordnet > 0) hinweise.push(`${unzugeordnet} Bauteile waren keinem Geschoss zugeordnet und wurden nach ihrer Höhenlage einsortiert.`)

  // ---- Raster über alle Bauteile mit Geometrie
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const b of bauteile.values()) if (b.art !== 'dach') for (let k = 0; k < b.tris.length; k += 2) { const x = b.tris[k], y = b.tris[k + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (!Number.isFinite(x0) || x1 - x0 < 1 || y1 - y0 < 1) {
    return fehler('keine-geometrie', 'Aus den Wänden und Decken des Modells ließ sich kein Grundriss lesen (keine oder winzige Geometrie). Bitte als DXF/OBJ exportieren.')
  }
  meld(0.88, 'Grundriss wird bestimmt …')
  await pause()
  const raster: Raster = rasterFuer(x0, y0, x1, y1)

  const geschosse: IfcGeschoss[] = []
  const masken = new Map<number, Uint8Array>()
  const vereinigt = neueMaske(raster)
  for (const g of geordnet) {
    const eigene = [...bauteile.values()].filter((b) => b.geschoss === g.i && b.tris.length > 0)
    const waende = eigene.filter((b) => b.art === 'wand')
    const quellen = waende.length > 0 ? waende : eigene.filter((b) => b.art === 'decke')
    const maske = neueMaske(raster)
    for (const b of quellen) fuelleDreiecke(raster, b.tris, maske)
    fuelleLoecher(raster, maske)
    const uG = unterirdisch(g)
    const oberkante = waende.length > 0 ? Math.max(...waende.map((b) => b.yMax)) - gelaende : null
    geschosse.push({
      name: g.name, elevationM: Math.round(g.elevation! * 1000) / 1000, unterirdisch: uG,
      oberkanteM: oberkante === null ? null : Math.round(oberkante * 100) / 100,
      waende: waende.length, flaecheM2: Math.round(flaecheM2(raster, maske) * 10) / 10,
    })
    if (uG || quellen.length === 0) continue
    masken.set(g.i, maske)
    oderMaske(vereinigt, maske)
  }
  const uGNamen = geschosse.filter((g) => g.unterirdisch).map((g) => g.name)
  if (uGNamen.length > 0) hinweise.push(`Untergeschosse (Elevation unter -0,5 m) wurden nicht berücksichtigt: ${uGNamen.join(', ')}.`)
  if (masken.size === 0) return fehler('keine-geometrie', 'Kein Geschoss über dem Gelände enthält Wände oder Decken – es lässt sich kein Umriss bilden. Bitte als DXF/OBJ exportieren.')
  if (bauteile.size > 0 && [...bauteile.values()].some((b) => b.art === 'dach' && b.tris.length > 0)) hinweise.push('Das Modell enthält ein Dach (IfcRoof). Dachform und Firsthöhe werden nicht aus dem IFC gelesen – Dachform bitte ergänzen (vorbelegt: Flachdach).')

  const { konturen } = aussenkonturen(raster, vereinigt)
  if (konturen.length === 0) return fehler('keine-geometrie', 'Aus dem Grundriss ließ sich keine geschlossene Außenkontur bilden. Bitte als DXF/OBJ exportieren.')

  // ---- Dieselbe Formerkennung wie bei DXF
  const form = umrissAusFiguren(konturen as Punkt2[][], { quelle: 'ifc' })
  if (!form.ok) return fehler('umriss-unbrauchbar', 'Der Grundriss aus dem Modell ergibt keinen brauchbaren Gebäudeumriss. Bitte als DXF/OBJ exportieren.', form.hinweise)
  const e: DxfUmrissErgebnis = form

  // ---- Höhen je Teil aus den Geschossen
  if (e.teile && e.abbildung) {
    const abb = e.abbildung
    const oben = geordnet.filter((g) => masken.has(g.i)).sort((a, b) => b.elevation! - a.elevation!)
    e.teile = e.teile.map((t): GebaeudeTeil => {
      const xs = t.grundriss.map((p) => p.x), zs = t.grundriss.map((p) => p.z)
      const xa = Math.min(...xs), xb = Math.max(...xs), za = Math.min(...zs), zb = Math.max(...zs)
      const probe: Punkt2[] = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([u, v]) => teilPunktInQuelle(abb, xa + u * (xb - xa), za + v * (zb - za)))
      for (const g of oben) {
        const treffer = probe.filter(([px, py]) => inMaske(raster, masken.get(g.i)!, px, py)).length
        if (treffer < 3) continue
        const info = geschosse.find((x) => x.name === g.name && Math.abs(x.elevationM - g.elevation!) < 1e-6)
        let hoehe = info?.oberkanteM ?? null
        let quelle = `Oberkante der Wände im Geschoss „${g.name}“ (Elevation ${fmt(g.elevation! - gelaende)} m über Gelände)`
        if (hoehe === null) {
          const naechstes = geordnet.find((x) => x.elevation! > g.elevation! + 0.05)
          if (naechstes) { hoehe = naechstes.elevation! - gelaende; quelle = `Elevation des Geschosses „${naechstes.name}“ über „${g.name}“` }
        }
        if (hoehe === null || hoehe <= 0) break
        return { ...t, hoeheM: Math.round(hoehe * 100) / 100, hinweis: `Höhe aus IFC: ${quelle} – Vorschlag, bitte prüfen (bei Giebelwänden liegt die Traufe tiefer)` }
      }
      return { ...t, hoeheM: 0, hinweis: 'Höhe ergänzen – im IFC konnte für dieses Teil keine Höhe bestimmt werden' }
    })
    if (e.teile.length > 1) e.hinweise.push('Die Höhen der Teile stammen aus den Geschossen des IFC (Wandoberkanten) und sind überschreibbar.')
  } else if (!e.teile) {
    e.hinweise.push('Die Form lässt sich nicht in einfache Gebäudeteile gliedern – der Umriss wird verwendet. Höhe bitte von Hand eintragen (höchstes Geschoss: ' + (geschosse.filter((g) => g.oberkanteM !== null).map((g) => `${g.name} ${fmt(g.oberkanteM!)} m`).slice(-1)[0] ?? 'unbekannt') + ').')
  }
  e.hinweise = [...hinweise, ...e.hinweise]
  e.einheit = 'm'
  e.einheitQuelle = 'zeichnung'
  if (bytes > IFC_WARN_BYTES) e.hinweise.push(`Große Datei (${mb(bytes)} MB) – das Ergebnis bitte besonders sorgfältig prüfen.`)
  meld(1, 'Fertig')
  return { ...e, geschosse, gelaendeElevationM: Math.round(gelaende * 1000) / 1000, dateiBytes: bytes, schema }
}
