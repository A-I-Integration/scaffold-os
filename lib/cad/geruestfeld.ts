// Komplettes Gerüstfeld per Klick: Feld(er) mit Parametern, erzeugt mit derselben Feld-Erzeugung wie das automatische Gerüst
// (generateScaffoldComponents auf einem Hilfsmodell) – keine zweite Berechnung. Alle Teile tragen dieselbe `assemblyId`
// ("feld-…") und bleiben einzeln auswählbar, verschiebbar und löschbar.
// Annahmen: Die Belagshöhe der Lage ist Oberkante Belag = Aufstandshöhe + Lagen × Geschosshöhe (so erzeugt es der Generator);
// Hersteller/System wirken über das gewählte System (Feldlängen, Breiten). Konfiguration filtert nur Teilearten, sie erfindet keine.
import {
  feldRahmen,
  generateScaffoldComponents,
  feldBauteilArtVonId,
  addManualPlacement,
  type CADModel,
  type ManualPlacement,
  type FeldBauteilArt,
  type ScaffoldComponent3D,
  type ScaffoldField,
  type ScaffoldLevel,
} from '@/lib/calculations/cad-engine'
import { findeSystem } from '@/lib/calculations/geruest-systeme'

export interface GeruestfeldParameter {
  side: 'front' | 'back' | 'left' | 'right'
  /** Klickpunkt in Weltkoordinaten (x, z): bestimmt die Stelle entlang der Seite */
  klickX: number
  klickZ: number
  /** Feldlänge in m (muss > 0 sein; Standardlängen des Systems werden empfohlen, andere Längen sind erlaubt und gekennzeichnet) */
  feldlaengeM: number
  /** Gerüstbreite in m */
  breiteM: number
  /** Anzahl Lagen übereinander (1…30) */
  lagen: number
  /** Geschosshöhe = Höhe einer Lage in m */
  geschosshoeheM: number
  /** Aufstandshöhe des untersten Rahmens in m, bezogen auf ±0,00 */
  aufstandM?: number
  /** Gewähltes System (id); ohne Angabe: System des Modells */
  systemId?: string
  /** Welche Teilearten das Feld enthält; ohne Angabe alle */
  konfiguration?: FeldBauteilArt[]
  /** Eindeutige Kennung der Baugruppe */
  id: string
}

export interface GeruestfeldErgebnis {
  ok: boolean
  fehler?: string
  hinweise: string[]
  teile: ScaffoldComponent3D[]
  felder: ScaffoldField[]
  /** Oberkante des obersten Belags in m */
  belagshoeheM?: number
}

export function geruestfeldErzeugen(model: CADModel, p: GeruestfeldParameter): GeruestfeldErgebnis {
  const fehler = (f: string): GeruestfeldErgebnis => ({ ok: false, fehler: f, hinweise: [], teile: [], felder: [] })
  const hinweise: string[] = []
  const system = p.systemId ? findeSystem(p.systemId) : model.system
  if (!system) return fehler('Kein Gerüstsystem gewählt.')
  if (!(p.feldlaengeM > 0.3 && p.feldlaengeM <= 4)) return fehler('Feldlänge muss zwischen 0,3 und 4 m liegen.')
  if (!(p.breiteM >= 0.3 && p.breiteM <= 2)) return fehler('Gerüstbreite muss zwischen 0,3 und 2 m liegen.')
  if (!Number.isInteger(p.lagen) || p.lagen < 1 || p.lagen > 30) return fehler('Anzahl Lagen: ganze Zahl von 1 bis 30.')
  if (!(p.geschosshoeheM >= 0.5 && p.geschosshoeheM <= 3)) return fehler('Geschosshöhe muss zwischen 0,5 und 3 m liegen.')
  const vorlage = model.fields.find((f) => f.side === p.side)
  if (!vorlage) return fehler('Auf dieser Seite gibt es keine Gerüstflucht, an der das Feld ausgerichtet werden kann (zuerst Seite wählen).')

  if (!system.feldlangenM.includes(p.feldlaengeM)) hinweise.push(`Feldlänge ${p.feldlaengeM.toFixed(2)} m ist keine Standardlänge des Systems (${system.feldlangenM.join(' / ')} m) – Restfeld, Bauteile nach Länge geprüft.`)
  if (!system.rahmenBreitenM.some((b) => Math.abs(b - p.breiteM) < 0.005)) hinweise.push(`Breite ${p.breiteM.toFixed(2)} m ist keine Rahmenbreite des Systems (${system.rahmenBreitenM.join(' / ')} m).`)

  // Stelle entlang der Seite aus dem Klickpunkt, Abstand zur Wand wie die vorhandene Flucht dieser Seite
  const rahmen = feldRahmen(vorlage, model.building)
  const [lxKlick] = rahmen.toLocal(p.klickX, p.klickZ)
  const [, lzVorlage] = rahmen.toLocal(vorlage.positionX, vorlage.positionZ)
  const [wx, wz] = rahmen.toWorld(lxKlick, lzVorlage)
  const y0 = p.aufstandM ?? 0

  const felder: ScaffoldField[] = []
  const lagen: ScaffoldLevel[] = []
  for (let i = 0; i < p.lagen; i++) {
    const bottomY = y0 + i * p.geschosshoeheM
    const f: ScaffoldField = {
      ...vorlage,
      id: `${p.id}-f${i}`,
      index: i,
      lengthM: p.feldlaengeM,
      widthM: p.breiteM,
      positionX: wx,
      positionY: bottomY,
      positionZ: wz,
      levelIndex: i,
      isCorner: false,
      durchgang: undefined, durchgangOffen: undefined, durchgangOben: undefined, verstaerkt: undefined,
      fuss: undefined,
    }
    felder.push(f)
    lagen.push({ id: `${p.id}-l${i}`, index: i, heightM: p.geschosshoeheM, bottomY, topY: bottomY + p.geschosshoeheM, fields: [f] })
  }

  const hilfs: CADModel = {
    ...model,
    system,
    fields: felder,
    levels: lagen,
    components3D: [],
    anchors: [],
    warnings: [],
    building: { ...model.building, geruestOptionen: { ...model.building.geruestOptionen, treppe: false, tuerenFreihalten: false, gelaendeSeiteM: undefined, gelaendeLinieSeiteM: undefined, gelaendeEckenM: undefined, gelaendeProfilM: undefined } },
  }
  const erlaubt = p.konfiguration ? new Set<string>(p.konfiguration) : null
  const feldIds = new Set(felder.map((f) => f.id))
  const roh = generateScaffoldComponents(hilfs).filter((c) => !!c.fieldId && feldIds.has(c.fieldId))
  const teile = roh
    .filter((c) => { if (!erlaubt) return true; const a = feldBauteilArtVonId(c.id); return !!a && erlaubt.has(a) })
    .map((c) => ({ ...c, id: `${p.id}-${c.id}`, assemblyId: p.id }))
  if (teile.length === 0) return fehler('Mit diesen Parametern entstehen keine Bauteile.')
  return { ok: true, hinweise, teile, felder, belagshoeheM: y0 + p.lagen * p.geschosshoeheM }
}

/** Platzierung anwenden: Gerüstfelder per Klick werden hier aufgebaut, alles andere übernimmt addManualPlacement. */
export function wendePlatzierungAn(model: CADModel, pl: ManualPlacement): CADModel {
  if (pl.type !== 'geruestfeld') return addManualPlacement(model, pl)
  if (!pl.feld) return model
  const r = geruestfeldErzeugen(model, { ...pl.feld, id: pl.id, side: pl.side, klickX: pl.positionX, klickZ: pl.positionZ, aufstandM: pl.positionY })
  if (!r.ok) return model
  return { ...model, components3D: [...model.components3D, ...r.teile] }
}

/** Weltpunkt (x, z) für ein Feld, das `abstandM` ab dem Anfang der Gerüstseite beginnt (Eingabe ohne Mausklick, „genaue Koordinaten“). */
export function seitenStelle(model: CADModel, side: GeruestfeldParameter['side'], abstandM: number, feldlaengeM: number): [number, number] | null {
  const fs = model.fields.filter((f) => f.side === side)
  if (fs.length === 0) return null
  const rahmen = feldRahmen(fs[0], model.building)
  const anfang = Math.min(...fs.map((f) => rahmen.toLocal(f.positionX, f.positionZ)[0] - f.lengthM / 2))
  const [, lz] = rahmen.toLocal(fs[0].positionX, fs[0].positionZ)
  return rahmen.toWorld(anfang + abstandM + feldlaengeM / 2, lz)
}
