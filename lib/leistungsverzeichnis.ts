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

export const GRUNDSTANDZEIT_WOCHEN = 4

/** Lastklassen nach DIN EN 12811-1 (gleichmäßig verteilte Last in kN/m²) – Normtext nicht geprüft. */
export const LASTKLASSEN: Record<number, number> = { 1: 0.75, 2: 1.5, 3: 2.0, 4: 3.0, 5: 4.5, 6: 6.0 }

/**
 * Aufbau des LV:
 *  - 'getrennt': Aufbau, Vorhaltung (Gesamtstandzeit) und Abbau als eigene Positionen (wie ZECH/BVG)
 *  - 'grundstandzeit': Auf- und Abbau mit 4 Wochen Grundvorhaltung in einer Position, danach Verlängerung (wie St. Kilian)
 */
export type LvStil = 'getrennt' | 'grundstandzeit'

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
  /** Gesamtpreis = Menge × EP, auf Cent gerundet */
  gp: number
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
  const stundenAufAb = quelle.aufbauStunden + quelle.abbauStunden
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
  const epAufbau = (g: Gruppe, menge: number) => epLohn(g, menge, quelle.aufbauStunden)
  const epAbbau = (g: Gruppe, menge: number) => epLohn(g, menge, quelle.abbauStunden)

  /** Positionen eines Titels fortlaufend nummerieren: "02.1", "02.2" … */
  const titelMit = (nr: number) => {
    const liste: LvPosition[] = []
    const nrText = String(nr).padStart(2, '0')
    const add = (titel: string, text: string[], menge: number, einheit: string, ep: number): LvPosition => {
      const p: LvPosition = { nr: `${nrText}.${liste.length + 1}`, titel, text, menge, einheit, ep, gp: cent(menge * ep) }
      liste.push(p)
      return p
    }
    return { liste, add, nrText }
  }

  const breite = model.fields[0]?.widthM ?? 0
  const bk = breitenklasse(breite)
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
    `Traufe des Gebäudes bei ca. ${de(traufe, 2)} m, Höhe der obersten Gerüstlage ca. ${de(model.totalHeightM, 2)} m über dem Gelände${first > traufe ? `, First bei ca. ${de(first, 2)} m` : ''}.`,
    'Ankerlöcher sind nach Fertigstellung fachgerecht zu verschließen.',
  ]
  const aktiveZusatz = (e.zusatz ?? []).filter((z) => z.menge > 0)

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
      `Bauhöhe ca. ${de(model.totalHeightM, 2)} m.`,
    ], treppen, 'St', epAufbau('treppe', treppen))
    // Vorhaltung
    vorhalt('Arbeits- und Schutzgerüst', 'geruest', flaecheM2 + giebelM2, 'm²Wo', 'm² Gerüst', `Arbeits- und Schutzgerüst, Höhe der obersten Gerüstlage ca. ${de(model.totalHeightM, 2)} m`)
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
      `Bauhöhe ca. ${de(model.totalHeightM, 2)} m.`,
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

  const summe = (p: LvPosition[]) => cent(p.reduce((s, x) => s + x.gp, 0))
  const titel: LvTitel[] = [
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
      `Mengen aus dem CAD-Modell. Gerüstfläche = Länge × Höhe der eingerüsteten Fassade${e.hoehenZuschlagM > 0 ? ` + Höhenzuschlag ${de(e.hoehenZuschlagM, 2)} m` : ''}${e.oeffnungenAbzugM2 > 0 ? ` − Öffnungen ${de(e.oeffnungenAbzugM2, 2)} m²` : ''}. Höhenzuschlag und Öffnungsabzug sind Eingaben nach deinen vertraglichen Regeln (ATV DIN 18451); der Normtext ist nicht hinterlegt und nicht geprüft.`,
      ...(giebelM2 > 0 ? ['Giebelflächen der Dachgauben sind eine Eingabe (nicht im CAD). Der EP der Zulage (Pos. 1.09) entspricht dem EP von Pos. 1.01 – Annahme.'] : []),
      `Einheitspreise abgeleitet aus dem Materialwert der Stückliste (${de(matGesamt, 2)} €), Aufbau-/Abbaustunden (${de(stundenAufAb, 0)} h, nach Materialwert auf die Positionen verteilt) und den eingegebenen Faktoren.`,
      `Vorhaltung je Woche = Materialwert × Mietsatz × (1 + Zuschlag), geteilt durch die Menge.${e.stil === 'grundstandzeit' ? ` Grundposition = (Stunden × Stundensatz Facharbeiter + Materialwert × Mietsatz × ${GRUNDSTANDZEIT_WOCHEN} Wochen) × (1 + Zuschlag), geteilt durch die Menge.` : ''}`,
      e.stil === 'getrennt'
        ? `Aufbau, Vorhaltung und Abbau sind getrennte Positionen (Aufbau wie in den Muster-LVs). Vorhaltung über die gesamte Standzeit von ${de(e.gesamtStandzeitWochen, 0)} Wochen (Menge × Wochen). Aufbau-EP = Aufbaustunden × Stundensatz Facharbeiter, Abbau-EP = Abbaustunden × Stundensatz (je mit Zuschlag, nach Materialwert verteilt); das Material steckt in der Vorhaltung.`
        : `Gesamt-Standzeit ${de(e.gesamtStandzeitWochen, 0)} Wochen, davon ${GRUNDSTANDZEIT_WOCHEN} Wochen Grundstandzeit in der Aufbauposition, danach Verlängerung der Vorhaltung.`,
      ...(aktiveZusatz.length ? ['Dachfanggerüst, Seitenschutz, Überbrückung, Strahlnetze, Aufzug und Bauzaun kommen nicht aus dem CAD-Modell: Menge und Einheitspreise sind Eingaben.'] : []),
      'Gliederung und Wortlaut orientieren sich an den Muster-LVs (ZECH Bau SE / BVG Los 4 und Ernst Architekten BDA / St. Kilian). Die Bezeichnung „SW“ der Breitenklasse folgt dem Muster-LV; Normtext nicht geprüft. Pauschalen für Statik, Baustelleneinrichtung und Anfahrt sind Eingaben.',
      'Last-, Breiten- und Höhenklasse nach DIN EN 12811-1 (Normtext nicht geprüft). Die Höhenklasse ist eine Eingabe, nicht aus dem CAD berechnet.',
      'Dieses LV ersetzt keine Statik und keine Prüfung durch eine befähigte Person.',
    ],
    fehlendeAngaben: fehlend,
  }
}

export const formatEuro = (v: number): string => de(v, 2) + ' €'
export const formatMenge = (v: number): string => de(v, 2)
