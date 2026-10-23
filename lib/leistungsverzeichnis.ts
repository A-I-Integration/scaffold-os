// ============================================================
// SCAFFOLD OS – Leistungsverzeichnis (LV) aus dem CAD-Modell
//
// Ein LV rechnet nicht nach Teilen, sondern nach Fläche (m²), Länge (m),
// Stück und Zeit (Wochen) – wie die Muster-LVs für Fassadengerüste.
// Gliederung und Wortlaut orientieren sich an zwei echten Muster-LVs:
//  - ZECH Bau SE / BVG Betriebshofverbund, Los 4 Gerüstarbeiten (Aufbau, Vorhaltung
//    und Abbau als getrennte Positionen; m², m, St, m²Wo, mWo, StWo),
//  - Ernst Architekten BDA / Pfarrkirche St. Kilian (Titel: Einrichtung, Außen-,
//    Inneneinrüstung, Stundenlohn; 4 Wochen Grundvorhaltung in der Position).
// Die Texte sind Vorlagen – Norm- und Vertragsangaben des jeweiligen Projekts prüfen.
// Mengen kommen aus dem CAD-Modell. Die Einheitspreise (EP) werden aus dem
// Materialwert der Stückliste und Faktoren abgeleitet, die die Firma selbst
// festlegt (Stundensatz, Mietsatz je Woche, Zuschlag). Es gibt KEINE
// eingebauten Preise: fehlt eine Angabe, meldet `fehlendeAngaben` das.
//
// ANNAHMEN (bitte prüfen, siehe `annahmen` im Ergebnis):
//  - Fläche = Länge × Höhe aus dem CAD (keine Abrechnungsregeln der ATV DIN 18451
//    wie Mindestlängen oder Abzüge – das regelt der Vertrag).
//  - Aufbau-/Abbaustunden wie in der Logistik-Anzeige, verteilt nach Materialwert.
//  - Vorhaltung je Woche = Materialwert × Mietsatz.
//  - Klassen (Last-, Breiten-, Höhenklasse) nach DIN EN 12811-1; Normtext nicht geprüft.
// ============================================================

import type { CADModel } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'
import { kappeModellAufHoehe, kappeMaterial } from '@/lib/cad/bauabschnitt'
import { standardpreisFuer, type LvStandardpreise } from '@/lib/lv-firmenwerte'
import { MIN_BREITE_AB_LK4_M } from '@/lib/geruestklassen'
import { lagenansatzText } from '@/lib/lastansatz'

export const GRUNDSTANDZEIT_WOCHEN = 4

/** Lastklassen nach DIN EN 12811-1 (gleichmäßig verteilte Last in kN/m²) – Normtext nicht geprüft. */
export const LASTKLASSEN: Record<number, number> = { 1: 0.75, 2: 1.5, 3: 2.0, 4: 3.0, 5: 4.5, 6: 6.0 }

/**
 * Aufbau des LV:
 *  - 'getrennt': Aufbau, Vorhaltung (Gesamtstandzeit) und Abbau als eigene Positionen (wie ZECH/BVG)
 *  - 'grundstandzeit': Auf- und Abbau mit 4 Wochen Grundvorhaltung in einer Position, danach Verlängerung (wie St. Kilian)
 *  - 'statiker': Gliederung des Auftraggeber-LV für Turmeinrüstungen (Stück-Pauschalen, Vorhaltung in Wochen, 2 Bauabschnitte; Muster: Wuppertal City-Kirche)
 */
export type LvStil = 'getrennt' | 'grundstandzeit' | 'statiker'

/** Zusatzleistungen aus den Muster-LVs, die nicht aus dem CAD-Modell kommen: Menge und EP trägt die Firma ein. */
export type ZusatzArt = 'dachfang' | 'seitenschutz' | 'ueberbrueckung' | 'strahlnetze' | 'aufzug' | 'bauzaun'
export interface LvZusatz {
  art: ZusatzArt
  /** Dachfanggerüst/Seitenschutz/Bauzaun in m, Strahlnetze in m², Überbrückung/Aufzug in Stück; 0 = Position entfällt */
  menge: number
  /** EP Aufbau, EP Vorhaltung je Woche, EP Abbau (jeweils netto, je Einheit) */
  epAuf: number
  epVorh: number
  epAb: number
}

export const ZUSATZ_INFO: Record<ZusatzArt, { name: string; einheit: string; /** Vorhalteeinheit je Woche */ woEinheit: string; /** Leistungsbeschreibung (ohne Projektwerte) */ text?: string }> = {
  dachfang: { name: 'Dachfanggerüst DIN 4420-1', einheit: 'm', woEinheit: 'mWo' },
  seitenschutz: { name: 'Zusätzlicher Seitenschutz (innenliegendes Geländer)', einheit: 'm', woEinheit: 'mWo' },
  ueberbrueckung: { name: 'Überbrückung aus Systemgitterträgern (Einbringöffnung)', einheit: 'St', woEinheit: 'StWo' },
  // Nach dem Muster-LV Kirche (Ernst Architekten): Menge und Preise sind Eingaben, technische Werte (Netztyp, Tragkraft, Förderhöhe) trägt der Anwender in die Ausschreibung ein.
  strahlnetze: { name: 'Strahlnetze', einheit: 'm²', woEinheit: 'm²Wo', text: 'Vertikale Bekleidung der Außenachse des Gerüstes mit hochreißfesten Strahlnetzen zur Eindämmung der Staubentwicklung, Lieferung und Montage im Rastermaß des Gerüstes, spätere Demontage. Netztyp, Brandverhalten und Höhe nach Angabe des Auftraggebers.' },
  aufzug: { name: 'Personen- und Lastenaufzug', einheit: 'St', woEinheit: 'StWo', text: 'Personen- und Lastenaufzug montieren und später wieder demontieren. Tragkraft, Grundfläche, Förderhöhe und Etageneinrichtungen nach Angabe des Auftraggebers.' },
  bauzaun: { name: 'Bauzaunelemente', einheit: 'm', woEinheit: 'mWo', text: 'Bauzaunanlage sachgerecht montieren und später wieder demontieren, Positionierung nach Vorgabe der Bauleitung.' },
}

export interface LvEingaben {
  stil: LvStil
  projektnummer: string
  /** Untergrund der Befestigung (z. B. Mauerwerk, Beton) */
  untergrundBefestigung: string
  /** Aufstellung (z. B. auf befestigtem Gelände) */
  aufstellung: string
  /** genutzte Gerüstlagen */
  lagen: 'alle' | 'obere'
  /** Pauschale technische Bearbeitung / statische Berechnung (€ netto) */
  statikPauschale: number
  /** Pauschale Baustelleneinrichtung (€ netto), 0 = Position entfällt */
  baustelleneinrichtung: number
  /** Anfahrtspauschale je Einsatz (€ netto), 0 = Position entfällt */
  anfahrtspauschale: number
  anfahrtAnzahl: number
  zusatz: LvZusatz[]
  bauvorhaben: string
  bauherr: string
  objektadresse: string
  auftragnehmer: string
  /** Gesamt-Standzeit in Wochen; über die Grundstandzeit (4 Wochen) hinaus wird Vorhaltung berechnet */
  gesamtStandzeitWochen: number
  lastklasse: number
  hoehenklasse: 'H1' | 'H2'
  /** € je Stunde (netto) */
  stundensatzFach: number
  stundensatzHelfer: number
  stundenFach: number
  stundenHelfer: number
  /** Vorhaltung je Woche in % vom Materialwert */
  mietsatzProzentJeWoche: number
  /** Zuschlag (Wagnis, Gewinn, Transport, Verwaltung) auf die Kosten in % */
  zuschlagProzent: number
  mwstProzent: number
  /** Abrechnungsregeln (vom Nutzer einzustellen, keine Normwerte voreingestellt): */
  /** Höhenzuschlag auf die Gerüstfläche in m (z. B. Überstand über Traufe/Attika, wie im Vertrag/ATV vereinbart) */
  hoehenZuschlagM: number
  /** Abzug für Öffnungen in m² (Summe der Öffnungen, die nach Vertrag/ATV abzuziehen sind) */
  oeffnungenAbzugM2: number
  /** Giebelflächen der Dachgauben in m² (Zulage, nicht im CAD) */
  giebelflaecheM2: number
  /** Höhe des Fanggerüsts in m (optional, 0 = nicht angeben) */
  fanggeruestHoeheM: number
  /** Breitenklasse von Hand (z. B. "W09"); leer = aus der Gerüstbreite im CAD */
  breitenklasseManuell?: string
  /** Höhe des Gerüsts laut Ausschreibung in m (z. B. 32 bei „bis 32 m“, Dachfang über der Traufe); leer = Höhe aus dem CAD */
  geruestHoeheAusschreibungM?: number
  /** Eigene Aufbau-/Abbaustunden statt der Werte aus dem CAD (leer/undefined = CAD-Wert) */
  aufbauStundenManuell?: number
  abbauStundenManuell?: number
  /** Stil „statiker“: Faktor in % auf alle Positionen außer Vorhaltung und Stundenlohn (100 = keiner, z. B. 80) */
  pauschalFaktorProzent?: number
  /** Positionen, die entfallen (Schlüssel = Kurztitel): Menge 0, Nummer bleibt */
  gestrichen?: Record<string, boolean>
  /** Eigene Einheitspreise / Mengen je Position, Schlüssel = Kurztitel der Position (bleibt stabil, wenn sich die Nummern verschieben) */
  epUeberschreibung?: Record<string, number>
  mengeUeberschreibung?: Record<string, number>
  /** Eigener Faktor in % je Position (Schlüssel = Kurztitel); 100 = kein Faktor */
  faktorUeberschreibung?: Record<string, number>
  /** Stil „statiker“: Höhe des 2. Bauabschnitts in m (Rückbau); das CAD wird darauf gekappt. Leer = 21,5 m, 0 = Positionen bleiben leer */
  hoeheBa2M?: number
  /** Stil „statiker“: Standzeit des 2. Bauabschnitts in Wochen (leer/0 = in der Tabelle eintragen) */
  standzeitBa2Wochen?: number
  /** Standardpreise aus der Datenpflege für Positionen ohne CAD-Wert (füllen nur, wo sonst 0 € stehen würde) */
  standardpreise?: LvStandardpreise
}

export const LV_STANDARD_EINGABEN: LvEingaben = {
  stil: 'getrennt',
  projektnummer: '',
  untergrundBefestigung: 'Mauerwerk',
  aufstellung: 'auf befestigtem Gelände',
  lagen: 'alle',
  statikPauschale: 0,
  baustelleneinrichtung: 0,
  anfahrtspauschale: 0,
  anfahrtAnzahl: 3,
  zusatz: [
    { art: 'dachfang', menge: 0, epAuf: 0, epVorh: 0, epAb: 0 },
    { art: 'seitenschutz', menge: 0, epAuf: 0, epVorh: 0, epAb: 0 },
    { art: 'ueberbrueckung', menge: 0, epAuf: 0, epVorh: 0, epAb: 0 },
    { art: 'strahlnetze', menge: 0, epAuf: 0, epVorh: 0, epAb: 0 },
    { art: 'aufzug', menge: 0, epAuf: 0, epVorh: 0, epAb: 0 },
    { art: 'bauzaun', menge: 0, epAuf: 0, epVorh: 0, epAb: 0 },
  ],
  bauvorhaben: '',
  bauherr: '',
  objektadresse: '',
  auftragnehmer: '',
  gesamtStandzeitWochen: 8,
  pauschalFaktorProzent: 100,
  lastklasse: 3,
  hoehenklasse: 'H1',
  stundensatzFach: 0,
  stundensatzHelfer: 0,
  stundenFach: 16,
  stundenHelfer: 16,
  mietsatzProzentJeWoche: 0,
  zuschlagProzent: 0,
  mwstProzent: 19,
  hoehenZuschlagM: 0,
  oeffnungenAbzugM2: 0,
  giebelflaecheM2: 0,
  fanggeruestHoeheM: 0,
}

export interface LvPosition {
  nr: string
  /** Kurztitel (fett) */
  titel: string
  /** Langtext (Absätze) */
  text: string[]
  menge: number
  einheit: string
  /** Einheitspreis netto, auf Cent gerundet */
  ep: number
  /** Gesamtpreis = Menge × EP × Faktor, auf Cent gerundet */
  gp: number
  /** Faktor in % auf Menge × EP (nur gesetzt, wenn er von 100 abweicht, z. B. 80 für „Preis × 80 %“) */
  faktorProzent?: number
  /** Position entfällt (von Hand gestrichen): Menge 0, Nummer bleibt erhalten */
  entfaellt?: boolean
  /** Was die Person von Hand geändert hat (sonst aus dem CAD / den Faktoren berechnet) */
  manuell?: { ep?: boolean; menge?: boolean; faktor?: boolean }
  /** Berechnete Werte vor der Änderung von Hand (zum Zurücksetzen und Anzeigen) */
  berechnet?: { ep: number; menge: number; faktor?: number }
}

export interface LvTitel {
  nr: number
  /** zweistellig, wie im GAEB-Aufbau der Muster-LVs ("02") */
  nrText: string
  titel: string
  positionen: LvPosition[]
  summe: number
}

export interface Leistungsverzeichnis {
  eingaben: LvEingaben
  kopf: { label: string; wert: string }[]
  titel: LvTitel[]
  summeNetto: number
  mwst: number
  summeBrutto: number
  annahmen: string[]
  /** Pflichtangaben, die für ein vollständiges LV noch fehlen */
  fehlendeAngaben: string[]
}

const cent = (v: number): number => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100
const r2 = (v: number): number => Math.round(v * 100) / 100
const de = (v: number, nk = 2): string => v.toLocaleString('de-DE', { minimumFractionDigits: nk, maximumFractionDigits: nk })

/** Breitenklasse nach DIN EN 12811-1 aus der Gerüstbreite (m) – Normtext nicht geprüft. */
export function breitenklasse(breiteM: number): string {
  if (!(breiteM > 0)) return 'unbekannt'
  const stufen: [number, string][] = [[2.4, 'W24'], [2.1, 'W21'], [1.8, 'W18'], [1.5, 'W15'], [1.2, 'W12'], [0.9, 'W09'], [0.6, 'W06']]
  for (const [ab, name] of stufen) if (breiteM >= ab - 1e-9) return name
  return 'kleiner als W06'
}

/** true, wenn von Hand eine breitere Klasse (z. B. W09) verlangt wird, als das CAD-Gerüst hat (W06 < 0,9 m, W09 ab 0,9 m …) */
export function breitenklasseZuSchmal(manuell: string | undefined, breiteM: number): boolean {
  const m = /^W(\d{2})$/.exec((manuell ?? '').trim().toUpperCase())
  if (!m || !(breiteM > 0)) return false
  return breiteM < Number(m[1]) / 10 - 1e-9
}

type Gruppe = 'geruest' | 'konsolen' | 'schutzdach' | 'treppe'
function gruppeVon(artikel: string): Gruppe {
  if (artikel.startsWith('KO-')) return 'konsolen'
  if (artikel.startsWith('SD-')) return 'schutzdach'
  if (artikel === 'SP-001' || artikel === 'ST-001' || artikel === 'ST-002') return 'treppe'
  return 'geruest'
}

export interface LvQuelle {
  model: CADModel
  materials: MaterialItem[]
  aufbauStunden: number
  abbauStunden: number
}

export function erzeugeLeistungsverzeichnis(quelle: LvQuelle, e: LvEingaben): Leistungsverzeichnis {
  const { model, materials } = quelle
  // Stunden: eigene Eingabe geht vor dem CAD-Wert
  const aufbauStunden = e.aufbauStundenManuell !== undefined && e.aufbauStundenManuell >= 0 ? e.aufbauStundenManuell : quelle.aufbauStunden
  const abbauStunden = e.abbauStundenManuell !== undefined && e.abbauStundenManuell >= 0 ? e.abbauStundenManuell : quelle.abbauStunden
  const comps = model.components3D
  const faktor = 1 + Math.max(0, e.zuschlagProzent) / 100

  // Mengen aus dem CAD
  const zuschlagFlaecheM2 = (e.hoehenZuschlagM || 0) * (model.totalLengthM || 0)
  const flaecheM2 = r2(Math.max(0, model.totalAreaM2 + zuschlagFlaecheM2 - (e.oeffnungenAbzugM2 || 0)))
  const giebelM2 = r2(Math.max(0, e.giebelflaecheM2 || 0))
  const dachRoh = comps.filter((c) => c.type === 'protection_roof')
  const einbauhoeheM = dachRoh.length ? r2(Math.min(...dachRoh.map((c) => c.position[1]))) : 0
  const konsolenM = r2(comps.filter((c) => c.type === 'console').reduce((s, c) => s + Math.abs(c.scale[0]), 0))
  const schutzdachM = r2(comps.filter((c) => c.type === 'protection_roof').reduce((s, c) => s + Math.abs(c.scale[0]), 0))
  const treppen = comps.filter((c) => c.type === 'stair').length

  // Materialwert je Gruppe
  const mat: Record<Gruppe, number> = { geruest: 0, konsolen: 0, schutzdach: 0, treppe: 0 }
  for (const m of materials) mat[gruppeVon(m.articleNumber)] += m.totalPrice
  const matGesamt = mat.geruest + mat.konsolen + mat.schutzdach + mat.treppe
  const stundenAufAb = aufbauStunden + abbauStunden
  const stundenVon = (g: Gruppe): number => (matGesamt > 0 ? (stundenAufAb * mat[g]) / matGesamt : 0)

  const epGrund = (g: Gruppe, menge: number): number => {
    if (!(menge > 0)) return 0
    const kosten = stundenVon(g) * e.stundensatzFach + mat[g] * (e.mietsatzProzentJeWoche / 100) * GRUNDSTANDZEIT_WOCHEN
    return cent((kosten * faktor) / menge)
  }
  const epWoche = (g: Gruppe, menge: number): number => {
    if (!(menge > 0)) return 0
    return cent((mat[g] * (e.mietsatzProzentJeWoche / 100) * faktor) / menge)
  }
  /** Stunden nur für Aufbau bzw. Abbau (Anteil nach Materialwert) */
  const epLohn = (g: Gruppe, menge: number, stunden: number): number => {
    if (!(menge > 0) || !(matGesamt > 0)) return 0
    return cent(((stunden * mat[g]) / matGesamt * e.stundensatzFach * faktor) / menge)
  }
  const epAufbau = (g: Gruppe, menge: number) => epLohn(g, menge, aufbauStunden)
  const epAbbau = (g: Gruppe, menge: number) => epLohn(g, menge, abbauStunden)

  /** Positionen eines Titels fortlaufend nummerieren: "02.1", "02.2" … */
  const titelMit = (nr: number) => {
    const liste: LvPosition[] = []
    const nrText = String(nr).padStart(2, '0')
    const add = (titel: string, text: string[], menge: number, einheit: string, ep: number): LvPosition => {
      const mo = e.mengeUeberschreibung?.[titel]
      const eo = e.epUeberschreibung?.[titel]
      const mengeNeu = mo !== undefined && Number.isFinite(mo) && mo >= 0 ? mo : menge
      const epNeu = eo !== undefined && Number.isFinite(eo) && eo >= 0 ? cent(eo) : ep
      const p: LvPosition = {
        nr: `${nrText}.${liste.length + 1}`, titel, text, menge: mengeNeu, einheit, ep: epNeu, gp: cent(mengeNeu * epNeu),
        ...(mengeNeu !== menge || epNeu !== ep ? { manuell: { ...(mengeNeu !== menge ? { menge: true } : {}), ...(epNeu !== ep ? { ep: true } : {}) }, berechnet: { ep, menge } } : { berechnet: { ep, menge } }),
      }
      liste.push(p)
      return p
    }
    return { liste, add, nrText }
  }

  // Tatsächliche Oberkante des Gerüsts: oberste Lage (Raster) – liegt über der Gebäudehöhe, wenn diese kein Vielfaches der Rasterhöhe ist
  const geruestTopM = r2(model.levels?.length ? Math.max(...model.levels.map((l) => l.topY)) : model.totalHeightM)
  const breite = model.fields[0]?.widthM ?? 0
  const bk = e.breitenklasseManuell?.trim() ? e.breitenklasseManuell.trim().toUpperCase() : breitenklasse(breite)
  const kn = LASTKLASSEN[e.lastklasse]
  const traufe = model.building.eavesHeightM || model.building.heightM
  const first = model.building.heightM + (model.building.roofHeightM || 0)
  const wandabstand = model.building.geruestOptionen?.wandabstandM ?? 0.3
  const bauart = model.system?.bauart === 'rahmen' ? 'Rahmengerüst' : 'Modulgerüst'
  const ankerAnzahl = model.anchors?.length ?? 0
  const woGesamt = Math.max(0, e.gesamtStandzeitWochen)

  // Kopfzeilen des Gerüsttextes wie in den Muster-LVs (Klassen, Abstand, Verankerung, Untergrund, Aufstellung, Höhe)
  const geruestText = (modus: 'auf' | 'grund'): string[] => [
    modus === 'grund'
      ? `Arbeits- und Schutzgerüst nach DIN EN 12811-1 und DIN 4420-1 als Fassadengerüst an lotrechter Fassade auf- und abbauen und für die Dauer der Grundstandzeit (${GRUNDSTANDZEIT_WOCHEN} Wochen) vorhalten.`
      : 'Arbeits- und Schutzgerüst DIN EN 12811-1 und DIN 4420-1 als Fassadengerüst an lotrechter Fassade erstellen, Abbau und Vorhaltung werden gesondert vergütet.',
    `Standgerüst, längenorientiert, Fassadengerüst DIN EN 12810-1 als ${bauart}, Lastklasse ${e.lastklasse} (${de(kn ?? 0, 0)} kN/m²), Breitenklasse ${bk.replace(/^W/, 'SW')}, Höhenklasse ${e.hoehenklasse}.`,
    `${e.lagen === 'alle' ? 'Alle' : 'Obere'} Gerüstlagen genutzt, Einrüstung für Fassadenarbeiten und Dacharbeiten, an senkrechten Bauwerksaußenflächen.`,
    `Abstand zum Gebäude ${de(wandabstand, 2)} m, verankern nach Wahl des Auftragnehmers am Bauwerk${ankerAnzahl > 0 ? ` (laut CAD-Modell ca. ${ankerAnzahl} Anker)` : ''}, Untergrund der Befestigung ${e.untergrundBefestigung || 'laut Angabe'}.`,
    `Aufstellung: ${e.aufstellung || 'laut Angabe'}, Standfläche waagerecht, über Lastverteiler belastbar.`,
    `Traufe des Gebäudes bei ca. ${de(traufe, 2)} m, Höhe der obersten Gerüstlage ca. ${de(geruestTopM, 2)} m über dem Gelände${first > traufe ? `, First bei ca. ${de(first, 2)} m` : ''}.`,
    'Ankerlöcher sind nach Fertigstellung fachgerecht zu verschließen.',
  ]
  // Aufzug aus dem CAD (Gerüst-Einstellungen): Menge 1 und Kosten von Hand aus dem Modell statt aus den Zusatzleistungen
  const azOpt = model.building.geruestOptionen?.aufzug
  const zusatzEff: LvZusatz[] = (e.zusatz ?? []).map((z) => (z.art === 'aufzug' && azOpt
    ? { art: 'aufzug' as const, menge: 1, epAuf: azOpt.kostenAufbauEur ?? 0, epVorh: azOpt.kostenVorhaltungJeWocheEur ?? 0, epAb: azOpt.kostenAbbauEur ?? 0 }
    : z))
  const kederplaneFlaecheM2 = r2(comps.filter((c) => c.type === 'sheeting').reduce((sum, c) => sum + Math.abs(c.scale[0]) * Math.abs(c.scale[1]), 0))
  const aktiveZusatz = zusatzEff.filter((z) => z.menge > 0)

  // ── Titel 01: Technische Bearbeitung, Baustelleneinrichtung ──
  const T1 = titelMit(1)
  T1.add('Technische Bearbeitung, statische Berechnung', [
    'Statische Berechnung nach DIN EN 12811-1 einschließlich der erforderlichen Ausführungszeichnungen als Werk- und Montageplanung für die nachfolgend beschriebenen Gerüste anfertigen.',
    'Aufstellen der statischen Berechnungen für alle Abweichungen von den Regelausführungen einschließlich Übersichtszeichnung mit Positionsplan.',
    'Verankerungsprotokoll mit Prüfung der Verankerungen.',
  ], 1, 'psch', cent(e.statikPauschale))
  if (e.baustelleneinrichtung > 0) {
    T1.add('Baustelleneinrichtung', ['Baustelleneinrichtung für den eigenen Bedarf einrichten und später wieder demontieren, An- und Rücklieferung sämtlicher Materialien und Geräte.'], 1, 'psch', cent(e.baustelleneinrichtung))
  }

  // ── Titel 02: Gerüst ──
  const T2 = titelMit(2)
  const vorhalt = (art: string, g: Gruppe, menge: number, einheitWo: string, einheitBasis: string, bezug: string) => {
    if (!(woGesamt > 0) || !(menge > 0)) return
    T2.add(`Vorhaltung ${art}`, [`Vorhaltung für das zuvor beschriebene ${bezug}, Abrechnung nach ${einheitBasis} mal Vorhaltedauer in Wochen.`], r2(menge * woGesamt), einheitWo, epWoche(g, menge))
  }

  if (e.stil === 'getrennt') {
    // Aufbau
    T2.add('Arbeits- und Schutzgerüst, Fassadengerüst – Aufbau', geruestText('auf'), flaecheM2, 'm²', epAufbau('geruest', flaecheM2))
    if (giebelM2 > 0) T2.add('Einrüsten der Giebelflächen der Dachgauben – Aufbau', ['Einrüsten der Giebelflächen der Dachgauben auf der Dachfläche, als Zulage zum Fassadengerüst. Abbau und Vorhaltung werden gesondert vergütet.'], giebelM2, 'm²', epAufbau('geruest', flaecheM2))
    for (const z of aktiveZusatz) {
      const i = ZUSATZ_INFO[z.art]
      T2.add(`${i.name} – Aufbau`, [...(i.text ? [i.text] : []), `Aufbau ${i.name}, Abbau und Vorhaltung werden gesondert vergütet.`], z.menge, i.einheit, cent(z.epAuf))
    }
    if (konsolenM > 0) T2.add('Konsolen – Aufbau', ['Konsolen, herausnehmbar, als Belagsverbreiterung am vorgenannten Gerüst montieren. Abbau und Vorhaltung werden gesondert vergütet.'], konsolenM, 'm', epAufbau('konsolen', konsolenM))
    if (schutzdachM > 0) T2.add('Schutzdach – Aufbau', [
      'Schutzdach am vorgenannten Gerüst herstellen, Abbau und Vorhaltung werden gesondert vergütet.',
      ...(einbauhoeheM > 0 ? [`Einbauhöhe ca. ${de(einbauhoeheM, 2)} m über dem Gelände (aus dem CAD-Modell).`] : []),
      ...(e.fanggeruestHoeheM > 0 ? [`Höhe Fanggerüst: ${de(e.fanggeruestHoeheM, 2)} m.`] : []),
    ], schutzdachM, 'm', epAufbau('schutzdach', schutzdachM))
    if (treppen > 0) T2.add('Treppenaufgang – Aufbau', [
      'Treppenaufgang für Gerüst als Gerüsttreppe nach DIN EN 12811-1 vor dem Gerüst, mit Zwischenpodesten je Gerüstlage. Abbau und Vorhaltung werden gesondert vergütet.',
      `Bauhöhe ca. ${de(geruestTopM, 2)} m.`,
    ], treppen, 'St', epAufbau('treppe', treppen))
    // Vorhaltung
    vorhalt('Arbeits- und Schutzgerüst', 'geruest', flaecheM2 + giebelM2, 'm²Wo', 'm² Gerüst', `Arbeits- und Schutzgerüst, Höhe der obersten Gerüstlage ca. ${de(geruestTopM, 2)} m`)
    for (const z of aktiveZusatz) {
      const i = ZUSATZ_INFO[z.art]
      if (woGesamt > 0) T2.add(`Vorhaltung ${i.name}`, [`Vorhaltung für ${i.name}, Abrechnung nach ${i.einheit === 'St' ? 'Stück' : i.einheit === 'm²' ? 'Fläche' : 'Länge'} mal Vorhaltedauer in Wochen.`], r2(z.menge * woGesamt), i.woEinheit, cent(z.epVorh))
    }
    vorhalt('Konsolen', 'konsolen', konsolenM, 'mWo', 'Länge', 'Konsolen')
    vorhalt('Schutzdach', 'schutzdach', schutzdachM, 'mWo', 'Länge', 'Schutzdach')
    vorhalt('Treppenaufgang', 'treppe', treppen, 'StWo', 'Stück', 'Treppenaufgang')
    // Abbau
    T2.add('Arbeits- und Schutzgerüst – Abbau', [
      'Abbauen Arbeits- und Schutzgerüst DIN EN 12811-1, Standgerüst, längenorientiert, Fassadengerüst DIN EN 12810-1, Abbau zeitlich gestaffelt nach Aufforderung durch den AG.',
      `Lastklasse ${e.lastklasse} (${de(kn ?? 0, 0)} kN/m²), Breitenklasse ${bk.replace(/^W/, 'SW')}, Höhenklasse ${e.hoehenklasse}, ${e.lagen === 'alle' ? 'alle' : 'obere'} Gerüstlagen genutzt.`,
    ], flaecheM2, 'm²', epAbbau('geruest', flaecheM2))
    if (giebelM2 > 0) T2.add('Giebelflächen der Dachgauben – Abbau', ['Abbau der Einrüstung der Giebelflächen der Dachgauben.'], giebelM2, 'm²', epAbbau('geruest', flaecheM2))
    for (const z of aktiveZusatz) {
      const i = ZUSATZ_INFO[z.art]
      T2.add(`${i.name} – Abbau`, [`Abbau ${i.name}.`], z.menge, i.einheit, cent(z.epAb))
    }
    if (konsolenM > 0) T2.add('Konsolen – Abbau', ['Abbau der Konsolen.'], konsolenM, 'm', epAbbau('konsolen', konsolenM))
    if (schutzdachM > 0) T2.add('Schutzdach – Abbau', ['Abbau des Schutzdaches.'], schutzdachM, 'm', epAbbau('schutzdach', schutzdachM))
    if (treppen > 0) T2.add('Treppenaufgang – Abbau', ['Abbau Treppenaufgang der Bezugsposition.'], treppen, 'St', epAbbau('treppe', treppen))
  } else {
    // Auf- und Abbau mit Grundvorhaltung in einer Position, danach Verlängerung (St.-Kilian-Aufbau)
    const zusatzWo = Math.max(0, Math.round((e.gesamtStandzeitWochen - GRUNDSTANDZEIT_WOCHEN) * 100) / 100)
    const verl = (art: string, g: Gruppe, menge: number, einheitWo: string, bezug: string) => {
      if (!(zusatzWo > 0) || !(menge > 0)) return
      T2.add(`Verlängerung der Vorhaltung ${art}`, [`Verlängerung der Vorhaltung zur Vorposition ${bezug} über die Grundstandzeit (${GRUNDSTANDZEIT_WOCHEN} Wochen) hinaus.`], r2(menge * zusatzWo), einheitWo, epWoche(g, menge))
    }
    T2.add('Arbeits- und Schutzgerüst als längenorientiertes Fassadengerüst', geruestText('grund'), flaecheM2, 'm²', epGrund('geruest', flaecheM2))
    if (giebelM2 > 0) T2.add('Einrüsten der Giebelflächen der Dachgauben', ['Einrüsten der Giebelflächen der Dachgauben auf der Dachfläche, als Zulage zur Gerüstposition, inkl. Grundstandzeit.'], giebelM2, 'm²', epGrund('geruest', flaecheM2))
    verl('Fassadengerüst', 'geruest', flaecheM2 + giebelM2, 'm²Wo', 'Arbeits- und Schutzgerüst')
    for (const z of aktiveZusatz) {
      const i = ZUSATZ_INFO[z.art]
      T2.add(i.name, [...(i.text ? [i.text] : []), `${i.name} auf- und abbauen, inkl. Grundstandzeit (${GRUNDSTANDZEIT_WOCHEN} Wochen).`], z.menge, i.einheit, cent(z.epAuf + z.epAb + z.epVorh * GRUNDSTANDZEIT_WOCHEN))
      if (zusatzWo > 0) T2.add(`Verlängerung der Vorhaltung ${i.name}`, [`Verlängerung der Vorhaltung zur Vorposition ${i.name}.`], r2(z.menge * zusatzWo), i.woEinheit, cent(z.epVorh))
    }
    if (konsolenM > 0) T2.add('Konsolen', ['Konsolen, herausnehmbar, als Belagsverbreiterung am vorgenannten Gerüst montieren und später wieder demontieren, inkl. Grundstandzeit (' + GRUNDSTANDZEIT_WOCHEN + ' Wochen).'], konsolenM, 'm', epGrund('konsolen', konsolenM))
    verl('Konsolen', 'konsolen', konsolenM, 'mWo', 'Konsolen')
    if (schutzdachM > 0) T2.add('Schutzdach', [
      'Schutzdach am vorgenannten Gerüst herstellen, später wieder demontieren, inkl. Grundstandzeit (' + GRUNDSTANDZEIT_WOCHEN + ' Wochen).',
      ...(einbauhoeheM > 0 ? [`Einbauhöhe ca. ${de(einbauhoeheM, 2)} m über dem Gelände (aus dem CAD-Modell).`] : []),
      ...(e.fanggeruestHoeheM > 0 ? [`Höhe Fanggerüst: ${de(e.fanggeruestHoeheM, 2)} m.`] : []),
    ], schutzdachM, 'm', epGrund('schutzdach', schutzdachM))
    verl('Schutzdach', 'schutzdach', schutzdachM, 'mWo', 'Schutzdach')
    if (treppen > 0) T2.add('Gerüsttreppe', [
      'Gerüsttreppe nach DIN EN 12811-1 vor dem Gerüst, mit Zwischenpodesten je Gerüstlage, als Zugang zum Arbeitsbereich montieren und später wieder demontieren, inkl. Grundstandzeit (' + GRUNDSTANDZEIT_WOCHEN + ' Wochen).',
      `Bauhöhe ca. ${de(geruestTopM, 2)} m.`,
    ], treppen, 'St', epGrund('treppe', treppen))
    verl('Gerüsttreppe', 'treppe', treppen, 'StWo', 'Gerüsttreppe')
  }

  // ── Titel 03: Stundenlohnarbeiten ──
  const T3 = titelMit(3)
  T3.add('Fachmonteurstunden für nicht vertraglich geregelte Leistungen', ['Für die Ausführung nicht vertraglich geregelter Leistungen, ohne Materialgestellung und ohne anteilige LKW-Kosten. Ausführung nur auf Anweisung der Bauleitung.'], e.stundenFach, 'Std', cent(e.stundensatzFach))
  T3.add('Gerüstbau-Helferstunden für nicht vertraglich geregelte Leistungen', ['Für die Ausführung nicht vertraglich geregelter Leistungen, ohne Materialgestellung und ohne anteilige LKW-Kosten. Ausführung nur auf Anweisung der Bauleitung.'], e.stundenHelfer, 'Std', cent(e.stundensatzHelfer))
  if (e.anfahrtspauschale > 0 && e.anfahrtAnzahl > 0) {
    T3.add('Anfahrtspauschale', ['Anfahrtspauschale für unvorhergesehene Kleinsteinsätze zur Ausführung oder Teilausführung vertraglicher Leistungen, einschließlich sämtlicher Personal- und Fahrzeugkosten.'], e.anfahrtAnzahl, 'St', cent(e.anfahrtspauschale))
  }

  // ── Stil „statiker“: Gliederung wie im LV des Auftraggebers für eine Turmeinrüstung (Wuppertal City-Kirche) ──
  const statikerTitel = (): LvTitel[] => {
    const hoeheText = e.geruestHoeheAusschreibungM && e.geruestHoeheAusschreibungM > 0 ? e.geruestHoeheAusschreibungM : geruestTopM
    const nrFmt = (titelNr: string, i: number, zweistellig = false) => `${titelNr}.${zweistellig ? String(i).padStart(2, '0') : i}`
    const baue = (titelNr: string, zweistellig = false) => {
      const liste: LvPosition[] = []
      const add = (titel: string, text: string[], menge: number, einheit: string, epCad: number): LvPosition => {
        const mo = e.mengeUeberschreibung?.[titel]
        const eo = e.epUeberschreibung?.[titel]
        const std = epCad > 0 ? undefined : standardpreisFuer(e.standardpreise, titel)?.ep
        const ep = std ? cent(std) : epCad
        const streichen = e.gestrichen?.[titel] === true
        const mengeNeu = streichen ? 0 : mo !== undefined && Number.isFinite(mo) && mo >= 0 ? mo : menge
        const epNeu = eo !== undefined && Number.isFinite(eo) && eo >= 0 ? cent(eo) : ep
        const gueltig = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0
        const ohneFaktor = titel.startsWith('Vorhaltung') || titelNr === '12'
        // Rangfolge: von Hand je Position > Datenpflege je Position > allgemeiner Faktor > 100
        const fBerechnet = ohneFaktor ? 100 : [standardpreisFuer(e.standardpreise, titel)?.faktorProzent, e.pauschalFaktorProzent].find(gueltig) ?? 100
        const fo = e.faktorUeberschreibung?.[titel]
        const fHand = !ohneFaktor && gueltig(fo) ? fo : undefined
        const fEff = fHand ?? fBerechnet
        const faktorP = fEff !== 100 ? fEff : undefined
        const p: LvPosition = {
          nr: nrFmt(titelNr, liste.length + 1, zweistellig), titel, text, menge: mengeNeu, einheit, ep: epNeu, gp: cent(mengeNeu * epNeu * ((faktorP ?? 100) / 100)),
          ...(faktorP !== undefined ? { faktorProzent: faktorP } : {}),
          ...(streichen ? { entfaellt: true } : {}),
          ...(!streichen && (mengeNeu !== menge || epNeu !== ep || fEff !== fBerechnet) ? { manuell: { ...(mengeNeu !== menge ? { menge: true } : {}), ...(epNeu !== ep ? { ep: true } : {}), ...(fEff !== fBerechnet ? { faktor: true } : {}) } } : {}),
          berechnet: { ep, menge, faktor: fBerechnet },
        }
        liste.push(p)
        return p
      }
      return { liste, add }
    }
    const miet = (matSumme: number) => cent(matSumme * (e.mietsatzProzentJeWoche / 100) * faktor)
    const OHNE_CAD = 'Nicht aus dem CAD: Menge und Preis bitte in der Tabelle eintragen.'
    const vorh = (b: ReturnType<typeof baue>, bezugNr: string, bezugTitel: string, ep: number, einheit = 'Wo', mengeWo = woGesamt, text?: string) => {
      // Standardpreis „je Woche“ aus der Datenpflege: nur, wo das CAD/die Zusatzleistung keinen Preis liefert
      const bezug = b.liste.find((x) => x.nr === bezugNr)
      if (bezug?.entfaellt) mengeWo = 0
      const woche = ep > 0 || !bezug ? undefined : standardpreisFuer(e.standardpreise, bezug.titel)?.epJeWoche
      if (woche && bezug) {
        // Vorhaltung = Menge der Vorposition × Wochen. Menge 0 → nichts berechnen. 2. BA: nur deren Standzeit (leer = 0, in der Tabelle eintragen)
        const zweiteBa = /2\. ?BA/.test(bezug.titel)
        const wochen = zweiteBa ? Math.max(0, e.standzeitBa2Wochen ?? 0) : woGesamt
        const stueck = bezug.einheit === 'Stück' || bezug.einheit === 'Stck'
        mengeWo = bezug.menge > 0 ? bezug.menge * wochen : 0
        if (stueck) { if (bezug.menge > 1) einheit = 'StckWo' } else einheit = `${bezug.einheit}/Wo`
        ep = cent(woche)
      }
      return b.add(`Vorhaltung zur Vorposition ${bezugNr}`, [text ?? `Vorhaltung zur Vorposition ${bezugNr} ${bezugTitel}.`], r2(mengeWo), einheit, ep)
    }
    const zus = (art: ZusatzArt) => zusatzEff.find((z) => z.art === art)

    // Titel 01 – Baustelleneinrichtung
    const b1 = baue('01')
    const be = b1.add('Baustelleneinrichtung', ['Baustelleneinrichtung für den eigenen Bedarf einrichten und später wieder demontieren, An- und Rücklieferung sämtlicher Materialien und Geräte.'], 1, 'Stück', cent(e.baustelleneinrichtung))
    vorh(b1, be.nr, 'Baustelleneinrichtung', 0)
    const wc = b1.add('Baustellen-Container-WC', ['Baustellen-Container-WC für Damen und Herren. ' + OHNE_CAD], 1, 'Stück', 0)
    vorh(b1, wc.nr, 'Baustellen-Container-WC', 0)
    const zaun = zus('bauzaun')
    const bz = b1.add('Bauzaun', ['Schutzzaun zur Sicherung der Baustelle gegen unbefugtes Betreten und zur Sicherung der Baustelleneinrichtung.'], zaun?.menge ?? 0, 'm', cent(zaun?.epAuf ?? 0) + cent(zaun?.epAb ?? 0))
    vorh(b1, bz.nr, 'Bauzaun', cent(zaun?.epVorh ?? 0), 'm/Wo', (zaun?.menge ?? 0) * woGesamt)
    const tor = b1.add('Bauzauntor', ['Bewegliches Tor auf Rollen mit Kette und Zahlenschloss, Öffnungsbreite bis 4 m. ' + OHNE_CAD], 0, 'Stück', 0)
    vorh(b1, tor.nr, 'Bauzauntor', 0)
    const abd = b1.add('Abdecken von Bodenflächen BE', ['Baufolie und OSB-Platten auf den Bodenflächen innerhalb der Baustelleneinrichtung. ' + OHNE_CAD], 0, 'm²', 0)
    vorh(b1, abd.nr, 'Abdecken von Bodenflächen BE', 0, 'm²/Wo', 0)
    b1.add('Beantragung öffentlich-rechtliche Genehmigung', ['Antrag auf Sondernutzung der öffentlichen Verkehrsflächen zur Erstellung der Arbeitsgerüste. ' + OHNE_CAD], 1, 'Stck', 0)
    b1.add('Einrichten Halteverbotszone', ['Einrichten und Räumen einer Halteverbotszone zum Be- und Entladen der Fahrzeuge. ' + OHNE_CAD], 1, 'Stck', 0)
    const vs = b1.add('Verkehrssicherung', ['Kennzeichnung der Gerüste im öffentlichen Verkehrsraum mit Warnleuchten und Warnbaken. ' + OHNE_CAD], 1, 'Stck', 0)
    vorh(b1, vs.nr, 'Verkehrssicherung', 0, 'm²/Wo', 0)

    // Titel 02 – Gerüstarbeiten Turmschaft
    const b2 = baue('02')
    const klassen = `Lastklasse ${e.lastklasse} (${de(kn ?? 0, 0)} kN/m²), Breitenklasse ${bk}, Höhenklasse ${e.hoehenklasse}`
    const gGeruest = (epAufbau('geruest', flaecheM2) * flaecheM2 + epAbbau('geruest', flaecheM2) * flaecheM2)
    const gKonsolen = konsolenM > 0 ? epAufbau('konsolen', konsolenM) * konsolenM + epAbbau('konsolen', konsolenM) * konsolenM : 0
    const matGerKo = mat.geruest + mat.konsolen
    const g1 = b2.add(`Arbeitsgerüste mit integrierten Traggerüsten am Turmschaft bis ${de(hoeheText, 0)} m Höhe`, [
      `Systemgerüst als ${bauart} nach DIN EN 12811, ${klassen}, 1. Bauabschnitt, Höhe bis ${de(hoeheText, 2)} m (oberste Gerüstlage im CAD: ${de(geruestTopM, 2)} m, Gebäudehöhe ${de(model.totalHeightM, 2)} m, ${de(flaecheM2, 2)} m² Gerüstfläche).`,
      'Preis = Aufbau + Abbau aus dem CAD (Stunden × Stundensatz, mit Zuschlag), Vorhaltung in der Folgeposition.',
    ], 1, 'Stück', cent(gGeruest + gKonsolen))
    vorh(b2, g1.nr, 'Arbeitsgerüste am Turmschaft 1. BA', miet(matGerKo))
    // 2. Bauabschnitt: das CAD-Gerüst auf die Höhe des Rückbaus kappen (Annahme: gleiche Berechnung wie 1. BA, Aufbau + Abbau + Vorhaltung)
    const hBa2 = e.hoeheBa2M === undefined ? 21.5 : e.hoeheBa2M
    const ba2 = hBa2 > 0 ? kappeModellAufHoehe(model, hBa2) : null
    const woBa2 = Math.max(0, e.standzeitBa2Wochen ?? 0)
    const mat2: Record<Gruppe, number> = { geruest: 0, konsolen: 0, schutzdach: 0, treppe: 0 }
    if (ba2) for (const m of kappeMaterial(materials, model, ba2.model)) mat2[gruppeVon(m.articleNumber)] += m.totalPrice
    const matGesamt2 = mat2.geruest + mat2.konsolen + mat2.schutzdach + mat2.treppe
    const stunden2 = ba2 ? (aufbauStunden + abbauStunden) * ba2.flaechenAnteil : 0
    const lohn2 = (g: Gruppe): number => (matGesamt2 > 0 ? cent(((stunden2 * mat2[g]) / matGesamt2) * e.stundensatzFach * faktor) : 0)
    const miet2 = (matSumme: number) => cent(matSumme * (e.mietsatzProzentJeWoche / 100) * faktor)
    const hoeheBa2Text = ba2 ? de(ba2.obenM, 2) : de(hBa2 > 0 ? hBa2 : 21.5, 1)
    const g2Text = ba2
      ? [`Arbeitsgerüste am Turmschaft wie Pos. ${g1.nr}, 2. Bauabschnitt (Rückbau von ${de(hoeheText, 0)} m auf ca. ${hoeheBa2Text} m).`,
        `Aus dem CAD auf ${ba2.lagenBehalten} von ${ba2.lagenGesamt} Lagen gekappt (oberste Lage ${hoeheBa2Text} m, ${de(r2(flaecheM2 * ba2.flaechenAnteil), 2)} m² Gerüstfläche). Preis = Aufbau + Abbau wie 1. BA, auf die gekappte Fläche und Stückliste gerechnet; ein bereits stehender Gerüstteil aus dem 1. BA ist nicht abgezogen, bitte prüfen.`]
      : [`Arbeitsgerüste am Turmschaft wie Pos. ${g1.nr}, 2. Bauabschnitt (Rückbau von ${de(hoeheText, 0)} m auf ca. 21,5 m). ` + OHNE_CAD]
    const g2 = b2.add(`Arbeitsgerüste mit int. Tragger. am Turmschaft bis ca. 21,5 m Höhe`, g2Text, 1, 'Stück', ba2 ? cent(lohn2('geruest') + lohn2('konsolen')) : 0)
    vorh(b2, g2.nr, 'Arbeitsgerüste 2. BA', ba2 ? miet2(mat2.geruest + mat2.konsolen) : 0, 'Wo', woBa2)
    const ub = zus('ueberbrueckung')
    const ubp = b2.add('Überbrückungen Dachflächen angrenzende Bauteile', ['Gitterträger und Stahlträger zur Schaffung von Überbrückungen, Abfangungen und als lastenverteilende Unterkonstruktion. ' + (ub && ub.menge > 0 ? 'Preise aus den Zusatzleistungen im LV-Fenster.' : OHNE_CAD)], 1, 'Stück', ub && ub.menge > 0 ? cent(ub.menge * (ub.epAuf + ub.epAb)) : 0)
    vorh(b2, ubp.nr, 'Überbrückungen', ub && ub.menge > 0 ? cent(ub.menge * ub.epVorh) : 0)
    const sdN = dachRoh.length
    const sdAuf = sdN > 0 ? epAufbau('schutzdach', schutzdachM) * schutzdachM + epAbbau('schutzdach', schutzdachM) * schutzdachM : 0
    const sdp = b2.add('Schutzdächer Zugang Eingang Kirche', ['Schutzgerüst nach DIN 4420-1 und DGUV-Vorschriften bei turmartigen Bauwerken. Anzahl und Lage aus dem CAD sind ein Vorschlag (unten vorne), der Eingang ist im Modell nicht bekannt.'], sdN, 'Stück', sdN > 0 ? cent(sdAuf / sdN) : 0)
    vorh(b2, sdp.nr, 'Schutzdächer', miet(mat.schutzdach), 'Wo', sdN > 0 ? woGesamt : 0)
    const kd1 = b2.add('Vertikale Bekleidung der Gerüste 1. BA ca. 21,5m bis ca. 32m', ['Vertikale Bekleidung der Außenachse des Gerüstes mit Kederplane zur Eindämmung der Staubentwicklung. ' + (kederplaneFlaecheM2 > 0 ? `Aus dem CAD: ${de(kederplaneFlaecheM2, 2)} m² Plane (Höhenbereich ${de(model.building.geruestOptionen?.kederplane?.vonM ?? 0, 1)}–${de(model.building.geruestOptionen?.kederplane?.bisM ?? 0, 1)} m). Preis bitte eintragen.` : OHNE_CAD)], 1, 'Stück', 0)
    vorh(b2, kd1.nr, 'Vertikale Bekleidung 1. BA', 0, 'Wo', 0)
    const kederplane2M2 = ba2 ? r2(ba2.model.components3D.filter((c) => c.type === 'sheeting').reduce((sum, c) => sum + Math.abs(c.scale[0]) * Math.abs(c.scale[1]), 0)) : 0
    const kd2 = b2.add('Vertikale Bekleidung der Gerüste 2. BA bis ca. 17,5m', ['Vertikale Bekleidung der Außenachse des Gerüstes mit Kederplane bis ca. 17,5 m. ' + (kederplane2M2 > 0 ? `Aus dem CAD (2. BA, bis ${hoeheBa2Text} m gekappt): ${de(kederplane2M2, 2)} m² Plane. Preis bitte eintragen.` : OHNE_CAD)], 1, 'Stück', 0)
    vorh(b2, kd2.nr, 'Vertikale Bekleidung 2. BA', 0, 'Wo', 0)
    const tr1 = b2.add(`Gerüsttreppenturm 1. BA, H = ca. ${de(hoeheText, 0)} m`, ['Aufstieg zum Erreichen der Arbeitsplätze als Gerüsttreppe. Preis aus dem CAD (Aufbau + Abbau Treppenaufgang).'], 1, 'Stück',
      treppen > 0 ? cent(epAufbau('treppe', treppen) * treppen + epAbbau('treppe', treppen) * treppen) : 0)
    vorh(b2, tr1.nr, 'Gerüsttreppenturm 1. BA', miet(mat.treppe), 'Wo', treppen > 0 ? woGesamt : 0)
    const treppen2 = ba2 ? ba2.model.components3D.filter((c) => c.type === 'stair').length : 0
    const tr2 = b2.add('Gerüsttreppenturm 2. BA, H = ca. 21,5m', ['Gerüsttreppenturm am Turmschaft wie Pos. ' + tr1.nr + (treppen2 > 0 ? `, auf ca. ${hoeheBa2Text} m gekappt. Preis aus dem CAD (Aufbau + Abbau Treppenaufgang).` : '. ' + OHNE_CAD)], 1, 'Stück', treppen2 > 0 ? lohn2('treppe') : 0)
    vorh(b2, tr2.nr, 'Gerüsttreppenturm 2. BA', treppen2 > 0 ? miet2(mat2.treppe) : 0, 'Wo', treppen2 > 0 ? woBa2 : 0)
    const az = zus('aufzug')
    const az1 = b2.add(`Personen- und Lastenaufzug 500/800kg 1.BA H = ca. ${de(hoeheText, 0)}m`, ['Transportbühne für Personen und Lasten nach DIN EN 16719. ' + (azOpt ? `${azOpt.gemietet ? 'Gemietet von einem Fremdunternehmen' : 'Aus eigenem Inventar'}, Kosten von Hand aus den Gerüst-Einstellungen.` : az && az.menge > 0 ? 'Preise aus den Zusatzleistungen im LV-Fenster.' : OHNE_CAD)], 1, 'Stück', az && az.menge > 0 ? cent(az.menge * (az.epAuf + az.epAb)) : 0)
    vorh(b2, az1.nr, 'Personen- und Lastenaufzug 1. BA', az && az.menge > 0 ? cent(az.menge * az.epVorh) : 0)
    // Aufzug 2. BA: Höhe aus dem gekappten CAD-Modell (Aufzug reicht höchstens bis zur obersten verbleibenden Lage); Preis bleibt zum Selbsteintragen leer
    const aufzug2 = ba2 ? ba2.model.components3D.find((c) => c.type === 'elevator') : undefined
    const aufzug2HoeheM = aufzug2 ? r2(Math.abs(aufzug2.scale[1])) : 0
    const az2 = b2.add('Personen- und Lastenaufzug 500/800kg 2.BA H = ca. 21,5m', ['Aufzug am Turmschaft wie Pos. ' + az1.nr + (aufzug2HoeheM > 0 ? `, aus dem CAD auf ${de(aufzug2HoeheM, 2)} m gekappt. Preis bitte eintragen.` : '. ' + OHNE_CAD)], 1, 'Stück', 0)
    vorh(b2, az2.nr, 'Personen- und Lastenaufzug 2. BA', 0, 'Wo', 0)
    const hAnz = azOpt?.haltestellen && azOpt.haltestellen > 0 ? azOpt.haltestellen : 5
    const h1 = b2.add('Haltestellenausstattung 1. BA', ['System-Haltestellen für die Transportbühne. ' + (azOpt?.haltestellen ? 'Anzahl aus den Gerüst-Einstellungen, Preis bitte eintragen.' : OHNE_CAD)], hAnz, 'Stück', 0)
    vorh(b2, h1.nr, 'Haltestellenausstattung 1. BA', 0, 'StckWo', hAnz * woGesamt)
    const h2 = b2.add('Haltestellenausstattung 2. BA', ['System-Haltestellen für die Transportbühne. ' + OHNE_CAD], 10, 'Stück', 0)
    vorh(b2, h2.nr, 'Haltestellenausstattung 2. BA', 0, 'StckWo', 10 * woGesamt)
    const dsch = b2.add('Schutz von Dachflächen', ['Gummischrotmatten und Bohlenbelag als Lastverteilung sowie zum Schutz auf angrenzenden Dachflächen unter dem Gerüst. ' + OHNE_CAD], 1, 'Stück', 0)
    vorh(b2, dsch.nr, 'Schutz von Dachflächen', 0, 'Wo', 0)

    // Titel 03 – Umbau am Bestandsgerüst (nummeriert wie im LV: 03.01 …)
    const b3 = baue('03', true)
    b3.add('Ausbau / Umbau Beläge', ['Am bestehenden Gerüst werden Umbauarbeiten vorgenommen, um die Beläge temporär entfernen zu können. ' + OHNE_CAD], 12, 'Einsätze', 0)
    b3.add('Ausbau / Rückbau / Umbau Beläge', ['Rückbau und Umbau der Beläge am bestehenden Gerüst. ' + OHNE_CAD], 12, 'Einsätze', 0)
    b3.add('Ersatz der Bauteile', ['Ersatz von Bauteilen am bestehenden Gerüst. ' + OHNE_CAD], 12, 'Stück', 0)
    const um = b3.add('Umbau der Gerüste gem. Zeichnung -20', ['Umbau der obersten Arbeitslage zur Arbeitslage mit Aufnahme einer Hubeinrichtung. ' + OHNE_CAD], 1, 'Stück', 0)
    vorh(b3, um.nr, 'Umbau der Gerüste', 0, 'Wo', 0)
    b3.add('Umbau der Fachwerkbinder an den Gerüsten Nord, Süd und Ost', ['Umbau der Gitterträger in den oberen Arbeitslagen. ' + OHNE_CAD], 1, 'Stück', 0)

    // Titel 11 – Technische Bearbeitung
    const b11 = baue('11')
    b11.add('Technische Bearbeitung, Vorbemerkungen', ['Technische Bearbeitung gemäß Punkt 8, 9, 10 nach DIN EN 12811 sowie den Technischen Vorbemerkungen.'], 1, 'Stück', cent(e.statikPauschale))

    // Titel 12 – Stundenlohnarbeiten
    const b12 = baue('12')
    const std = 'Für die Ausführung nicht vertraglich geregelter Leistungen'
    b12.add('Facharbeiterstunden', [`${std}, ohne Materialgestellung und ohne anteilige LKW-Kosten.`], 50, 'h', cent(e.stundensatzFach))
    b12.add('Facharbeiterstunden inkl. Material, bei sep. An- und Abfahrt', [`${std}, einschließlich Materialgestellung und anteiliger LKW-Kosten. Preis bitte eintragen.`], 50, 'h', 0)
    b12.add('Helferstunden', [`${std}, ohne Materialgestellung und ohne anteilige LKW-Kosten.`], 50, 'h', cent(e.stundensatzHelfer))
    b12.add('Helferstunden inkl. Material, bei sep. An- und Abfahrt', [`${std}, einschließlich Materialgestellung und anteiliger LKW-Kosten. Preis bitte eintragen.`], 50, 'h', 0)
    b12.add('Anfahrtpauschalen', ['Anfahrtspauschale für unvorhergesehene Kleinsteinsätze zur Ausführung oder Teilausführung vertraglicher Leistungen.'], 10, 'Stck', cent(e.anfahrtspauschale))

    const ts = (nr: number, nrText: string, name: string, l: LvPosition[]): LvTitel => ({ nr, nrText, titel: name, positionen: l, summe: cent(l.reduce((s2, x) => s2 + x.gp, 0)) })
    return [
      ts(1, '01', 'Baustelleneinrichtung', b1.liste),
      ts(2, '02', 'Gerüstarbeiten Turmschaft', b2.liste),
      ts(3, '03', 'Umbau am Bestandsgerüst', b3.liste),
      ts(11, '11', 'Technische Bearbeitung', b11.liste),
      ts(12, '12', 'Stundenlohnarbeiten', b12.liste),
    ]
  }

  const summe = (p: LvPosition[]) => cent(p.reduce((s, x) => s + x.gp, 0))
  const titel: LvTitel[] = e.stil === 'statiker' ? statikerTitel() : [
    { nr: 1, nrText: T1.nrText, titel: 'Technische Bearbeitung und Baustelleneinrichtung', positionen: T1.liste, summe: summe(T1.liste) },
    { nr: 2, nrText: T2.nrText, titel: `Außeneinrüstung – Fassadengerüst Lastklasse ${e.lastklasse}${kn ? ` (${de(kn, 0)} kN/m²)` : ''}`, positionen: T2.liste, summe: summe(T2.liste) },
    { nr: 3, nrText: T3.nrText, titel: 'Stundenlohnarbeiten', positionen: T3.liste, summe: summe(T3.liste) },
  ]
  const summeNetto = cent(titel.reduce((s, t) => s + t.summe, 0))
  const mwst = cent(summeNetto * (e.mwstProzent / 100))

  const fehlend: string[] = []
  if (!(matGesamt > 0)) fehlend.push('Materialwert der Stückliste ist 0 – Preise im Lager pflegen')
  if (!(e.stundensatzFach > 0)) fehlend.push('Stundensatz Facharbeiter')
  if (!(e.stundensatzHelfer > 0)) fehlend.push('Stundensatz Helfer')
  if (!(e.mietsatzProzentJeWoche > 0)) fehlend.push('Mietsatz je Woche (% vom Materialwert)')
  if (!(flaecheM2 > 0)) fehlend.push('Gerüstfläche (kein Gerüst im Modell)')
  if (!(e.statikPauschale > 0)) fehlend.push('Pauschale technische Bearbeitung / statische Berechnung')
  if (e.stil === 'statiker') {
    // Positionen, die das CAD nicht liefert (Preis/Menge von Hand, Hinweis des Statikers): offen, solange EP oder Menge 0 ist
    const HAENDISCH = ['Überbrückungen', 'Schutzdächer', 'Haltestellenausstattung', 'Personen- und Lastenaufzug', 'Schutz von Dachflächen', 'Ausbau / Umbau Beläge', 'Ausbau / Rückbau / Umbau Beläge', 'Ersatz der Bauteile', 'Umbau der Gerüste', 'Umbau der Fachwerkbinder']
    const offen = titel.flatMap((t) => t.positionen).filter((p) => HAENDISCH.some((h) => p.titel.startsWith(h)) && !p.titel.startsWith('Vorhaltung') && (!(p.ep > 0) || !(p.menge > 0)))
    if (offen.length > 0) fehlend.push(`Preis oder Menge von Hand: ${[...new Set(offen.map((p) => `${p.nr} ${p.titel.replace(/ H = ca\..*$/, '')}`))].join(', ')}`)
  }
  for (const z of aktiveZusatz) {
    const i = ZUSATZ_INFO[z.art]
    if (!(z.epAuf > 0) || !(z.epAb > 0) || !(z.epVorh > 0)) fehlend.push(`Einheitspreise für ${i.name} (Aufbau, Vorhaltung je Woche, Abbau)`)
  }

  return {
    eingaben: e,
    kopf: [
      { label: 'Gewerk', wert: 'Gerüstarbeiten nach DIN 18451' },
      { label: 'Bauvorhaben', wert: e.bauvorhaben || '–' },
      ...(e.projektnummer ? [{ label: 'Projekt-Nr.', wert: e.projektnummer }] : []),
      { label: 'Objektadresse', wert: e.objektadresse || '–' },
      { label: 'Bauherr', wert: e.bauherr || '–' },
      { label: 'Anbieter', wert: e.auftragnehmer || '–' },
    ],
    titel,
    summeNetto,
    mwst,
    summeBrutto: cent(summeNetto + mwst),
    annahmen: [
      ...(e.lastklasse >= 4 && breite > 0 && breite < MIN_BREITE_AB_LK4_M - 1e-9 ? [`ACHTUNG Lastklasse ${e.lastklasse}: Nach DIN EN 12811-1 ist ab Lastklasse 4 mindestens die Breitenklasse W09 (0,90 m) erforderlich, das CAD-Gerüst ist ${de(breite, 2)} m breit (= ${breitenklasse(breite)}). Gerüstbreite im CAD erhöhen oder Lastklasse mit dem Statiker klären.`] : []),
      ...(breitenklasseZuSchmal(e.breitenklasseManuell, breite) ? [`ACHTUNG Breitenklasse: Gefordert ist ${bk}, das CAD-Gerüst ist ${de(breite, 2)} m breit (= ${breitenklasse(breite)}). Das Gerüst im CAD erfüllt die geforderte Breitenklasse nicht – Gerüstbreite im CAD anpassen oder die Klasse klären.`] : []),
      `Mengen aus dem CAD-Modell. Gerüstfläche = Länge × Höhe der eingerüsteten Fassade${e.hoehenZuschlagM > 0 ? ` + Höhenzuschlag ${de(e.hoehenZuschlagM, 2)} m` : ''}${e.oeffnungenAbzugM2 > 0 ? ` − Öffnungen ${de(e.oeffnungenAbzugM2, 2)} m²` : ''}. Höhenzuschlag und Öffnungsabzug sind Eingaben nach deinen vertraglichen Regeln (ATV DIN 18451); der Normtext ist nicht hinterlegt und nicht geprüft.`,
      ...(giebelM2 > 0 ? ['Giebelflächen der Dachgauben sind eine Eingabe (nicht im CAD). Der EP der Zulage (Pos. 1.09) entspricht dem EP von Pos. 1.01 – Annahme.'] : []),
      `Einheitspreise abgeleitet aus dem Materialwert der Stückliste (${de(matGesamt, 2)} €), Aufbau-/Abbaustunden (${de(stundenAufAb, 0)} h, nach Materialwert auf die Positionen verteilt) und den eingegebenen Faktoren.`,
      `Vorhaltung je Woche = Materialwert × Mietsatz × (1 + Zuschlag), geteilt durch die Menge.${e.stil === 'grundstandzeit' ? ` Grundposition = (Stunden × Stundensatz Facharbeiter + Materialwert × Mietsatz × ${GRUNDSTANDZEIT_WOCHEN} Wochen) × (1 + Zuschlag), geteilt durch die Menge.` : ''}`,
      e.stil === 'statiker'
        ? `Gliederung wie im LV des Auftraggebers (Turmeinrüstung): Stück-Pauschalen mit Vorhaltung in Wochen (Standzeit ${de(e.gesamtStandzeitWochen, 0)} Wochen). Preis der Gerüstposition = Aufbau + Abbau (Stunden × Stundensatz, mit Zuschlag) aus dem CAD; Vorhaltung je Woche = Materialwert × Mietsatz × (1 + Zuschlag). Annahme: 1. Bauabschnitt = gesamtes CAD-Gerüst; 2. Bauabschnitt (Gerüst, Treppenturm, Plane-Menge) = dasselbe CAD, gekappt auf die eingestellte Höhe (Standard 21,5 m, oberste Lage = nächstgelegene Lagenoberkante), Preis wie 1. BA (Aufbau + Abbau + Vorhaltung); Aufzug 2. BA: Höhe aus dem gekappten CAD (falls dort ein Aufzug eingestellt ist), Preis zum Selbsteintragen; Haltestellen 2. BA bleiben ohne Wert. Positionen ohne Wert im CAD (Kederplane-Preis, Haltestellen, Dachschutz, Umbau am Bestandsgerüst, Baustelleneinrichtung außer der Pauschale) haben Menge und Preis zum Selbsteintragen in der Tabelle.`
      : e.stil === 'getrennt'
        ? `Aufbau, Vorhaltung und Abbau sind getrennte Positionen (Aufbau wie in den Muster-LVs). Vorhaltung über die gesamte Standzeit von ${de(e.gesamtStandzeitWochen, 0)} Wochen (Menge × Wochen). Aufbau-EP = Aufbaustunden × Stundensatz Facharbeiter, Abbau-EP = Abbaustunden × Stundensatz (je mit Zuschlag, nach Materialwert verteilt); das Material steckt in der Vorhaltung.`
        : `Gesamt-Standzeit ${de(e.gesamtStandzeitWochen, 0)} Wochen, davon ${GRUNDSTANDZEIT_WOCHEN} Wochen Grundstandzeit in der Aufbauposition, danach Verlängerung der Vorhaltung.`,
      ...(e.stil === 'statiker' && e.pauschalFaktorProzent && e.pauschalFaktorProzent !== 100 ? [`Auf alle Positionen außer Vorhaltung und Stundenlohn wird ein Faktor von ${de(e.pauschalFaktorProzent, 0)} % angewendet (Gesamtpreis = Menge × EP × Faktor).`] : []),
      ...(aktiveZusatz.length ? ['Dachfanggerüst, Seitenschutz, Überbrückung, Strahlnetze, Aufzug und Bauzaun kommen nicht aus dem CAD-Modell: Menge und Einheitspreise sind Eingaben.'] : []),
      'Gliederung und Wortlaut orientieren sich an üblichen Muster-Leistungsverzeichnissen. Die Bezeichnung „SW“ der Breitenklasse folgt dem Muster-LV; Normtext nicht geprüft. Pauschalen für Statik, Baustelleneinrichtung und Anfahrt sind Eingaben.',
      'Last-, Breiten- und Höhenklasse nach DIN EN 12811-1 (Normtext nicht geprüft). Die Höhenklasse ist eine Eingabe, nicht aus dem CAD berechnet.',
      ...(lagenansatzText(e.lastklasse) ? [lagenansatzText(e.lastklasse)!] : []),
      ...(e.aufbauStundenManuell !== undefined || e.abbauStundenManuell !== undefined
        ? [`Stunden von Hand eingegeben: Aufbau ${de(aufbauStunden, 0)} h, Abbau ${de(abbauStunden, 0)} h (CAD-Wert: ${de(quelle.aufbauStunden, 0)} h / ${de(quelle.abbauStunden, 0)} h).`] : []),
      ...(Object.keys(e.epUeberschreibung ?? {}).length || Object.keys(e.mengeUeberschreibung ?? {}).length
        ? ['Einzelne Mengen oder Einheitspreise wurden von Hand geändert (im Vorschau-Dialog markiert); diese Werte ersetzen die berechneten.'] : []),
      'Dieses LV ersetzt keine Statik und keine Prüfung durch eine befähigte Person.',
    ],
    fehlendeAngaben: fehlend,
  }
}

export const formatEuro = (v: number): string => de(v, 2) + ' €'
export const formatMenge = (v: number): string => de(v, 2)
