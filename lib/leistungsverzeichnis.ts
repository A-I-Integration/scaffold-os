// ============================================================
// SCAFFOLD OS – Leistungsverzeichnis (LV) aus dem CAD-Modell
//
// Ein LV rechnet nicht nach Teilen, sondern nach Fläche (m²), Länge (lfdm),
// Stück und Zeit (Wochen) – wie das Muster-LV für Fassadengerüste.
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

export interface LvEingaben {
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
}

export const LV_STANDARD_EINGABEN: LvEingaben = {
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
  const zusatzWochen = Math.max(0, Math.round((e.gesamtStandzeitWochen - GRUNDSTANDZEIT_WOCHEN) * 100) / 100)
  const faktor = 1 + Math.max(0, e.zuschlagProzent) / 100

  // Mengen aus dem CAD
  const flaecheM2 = r2(model.totalAreaM2)
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
  const pos = (nr: string, titel: string, text: string[], menge: number, einheit: string, ep: number): LvPosition =>
    ({ nr, titel, text, menge, einheit, ep, gp: cent(menge * ep) })

  const breite = model.fields[0]?.widthM ?? 0
  const bk = breitenklasse(breite)
  const kn = LASTKLASSEN[e.lastklasse]
  const traufe = model.building.eavesHeightM || model.building.heightM
  const first = model.building.heightM + (model.building.roofHeightM || 0)

  const t1: LvPosition[] = []
  t1.push(pos('1.01', 'Arbeits- und Schutzgerüst, Fassadengerüst', [
    'Arbeits- und Schutzgerüst nach DIN EN 12811-1, als längenorientiertes Standgerüst, Fassadengerüst nach DIN EN 12810-1, auf- und abbauen und für die Dauer der Grundstandzeit (' + GRUNDSTANDZEIT_WOCHEN + ' Wochen) vorhalten.',
    `Lastklasse ${e.lastklasse} (${de(kn ?? 0, 2)} kN/m²) · Breitenklasse ${bk} · Höhenklasse ${e.hoehenklasse}`,
    'Einzurüstende Fläche: senkrecht, Standfläche: waagerecht.',
    `Traufe des Gebäudes bei ca. ${de(traufe, 2)} m, Gerüsthöhe bis ca. ${de(model.totalHeightM, 2)} m über dem Gelände${first > traufe ? `, First bei ca. ${de(first, 2)} m` : ''}.`,
    'Ankerlöcher sind nach Fertigstellung fachgerecht zu verschließen.',
  ], flaecheM2, 'm²', epGrund('geruest', flaecheM2)))
  if (zusatzWochen > 0) {
    t1.push(pos('1.02', 'Gebrauchsüberlassung über die Grundstandzeit', [
      `Gebrauchsüberlassung des vorbeschriebenen Gerüstes über ${GRUNDSTANDZEIT_WOCHEN} Wochen (Grundstandzeit) hinaus. Abrechnung nach Quadratmeter / Woche.`,
    ], r2(flaecheM2 * zusatzWochen), 'm²/Wo', epWoche('geruest', flaecheM2)))
  }
  if (konsolenM > 0) {
    t1.push(pos('1.03', 'Konsolen', [
      'Konsolen, herausnehmbar, als Belagsverbreiterung am vorgenannten Gerüst montieren. Grundstandzeit: ' + GRUNDSTANDZEIT_WOCHEN + ' Wochen.',
    ], konsolenM, 'lfdm', epGrund('konsolen', konsolenM)))
    if (zusatzWochen > 0) t1.push(pos('1.04', 'Gebrauchsüberlassung der Konsolen', [
      'Gebrauchsüberlassung der Konsolen über die Grundstandzeit hinaus. Abrechnung nach lfdm / Woche.',
    ], r2(konsolenM * zusatzWochen), 'lfdm/Wo', epWoche('konsolen', konsolenM)))
  }
  if (schutzdachM > 0) {
    t1.push(pos('1.05', 'Schutzdach', [
      'Schutzdach am vorgenannten Gerüst herstellen und für die Grundstandzeit (' + GRUNDSTANDZEIT_WOCHEN + ' Wochen) vorhalten.',
    ], schutzdachM, 'lfdm', epGrund('schutzdach', schutzdachM)))
    if (zusatzWochen > 0) t1.push(pos('1.06', 'Gebrauchsüberlassung des Schutzdaches', [
      'Gebrauchsüberlassung des Schutzdaches über die Grundstandzeit hinaus. Abrechnung nach lfdm / Woche.',
    ], r2(schutzdachM * zusatzWochen), 'lfdm/Wo', epWoche('schutzdach', schutzdachM)))
  }
  if (treppen > 0) {
    t1.push(pos('1.07', 'Treppenturm', [
      'Treppenturm (Baustellenbetrieb) als Gerüsttreppe nach DIN EN 12811-1 vor dem Gerüst, mit Zwischenpodesten je Gerüstlage. Grundstandzeit: ' + GRUNDSTANDZEIT_WOCHEN + ' Wochen.',
      `Bauhöhe ca. ${de(model.totalHeightM, 2)} m.`,
    ], treppen, 'Stk', epGrund('treppe', treppen)))
    if (zusatzWochen > 0) t1.push(pos('1.08', 'Gebrauchsüberlassung des Treppenturms', [
      'Gebrauchsüberlassung für den Treppenturm über die Grundstandzeit hinaus.',
    ], r2(treppen * zusatzWochen), 'Stk/Wo', epWoche('treppe', treppen)))
  }

  const t2: LvPosition[] = [
    pos('2.01', 'Facharbeiterstunden', ['Facharbeiterstunden nach Anweisung der Bauleitung zum Nachweis.'], e.stundenFach, 'Std', cent(e.stundensatzFach)),
    pos('2.02', 'Helferstunden', ['Helferstunden nach Anweisung der Bauleitung zum Nachweis.'], e.stundenHelfer, 'Std', cent(e.stundensatzHelfer)),
  ]

  const summe = (p: LvPosition[]) => cent(p.reduce((s, x) => s + x.gp, 0))
  const titel: LvTitel[] = [
    { nr: 1, titel: `Gerüst Lastklasse ${e.lastklasse}${kn ? ` (${de(kn, 2)} kN/m²)` : ''}`, positionen: t1, summe: summe(t1) },
    { nr: 2, titel: 'Stundenlohnarbeiten', positionen: t2, summe: summe(t2) },
  ]
  const summeNetto = cent(titel.reduce((s, t) => s + t.summe, 0))
  const mwst = cent(summeNetto * (e.mwstProzent / 100))

  const fehlend: string[] = []
  if (!(matGesamt > 0)) fehlend.push('Materialwert der Stückliste ist 0 – Preise im Lager pflegen')
  if (!(e.stundensatzFach > 0)) fehlend.push('Stundensatz Facharbeiter')
  if (!(e.stundensatzHelfer > 0)) fehlend.push('Stundensatz Helfer')
  if (!(e.mietsatzProzentJeWoche > 0)) fehlend.push('Mietsatz je Woche (% vom Materialwert)')
  if (!(flaecheM2 > 0)) fehlend.push('Gerüstfläche (kein Gerüst im Modell)')

  return {
    eingaben: e,
    kopf: [
      { label: 'Gewerk', wert: 'Gerüstarbeiten nach DIN 18451' },
      { label: 'Bauvorhaben', wert: e.bauvorhaben || '–' },
      { label: 'Objektadresse', wert: e.objektadresse || '–' },
      { label: 'Bauherr', wert: e.bauherr || '–' },
      { label: 'Anbieter', wert: e.auftragnehmer || '–' },
    ],
    titel,
    summeNetto,
    mwst,
    summeBrutto: cent(summeNetto + mwst),
    annahmen: [
      'Mengen aus dem CAD-Modell. Gerüstfläche = Länge × Höhe der eingerüsteten Fassade; Abrechnungsregeln der ATV DIN 18451 (z. B. Mindestlänge, Abzüge) sind nicht eingerechnet – bitte mit dem Vertrag abgleichen.',
      `Einheitspreise abgeleitet aus dem Materialwert der Stückliste (${de(matGesamt, 2)} €), Aufbau-/Abbaustunden (${de(stundenAufAb, 0)} h, nach Materialwert auf die Positionen verteilt) und den eingegebenen Faktoren.`,
      `Grundposition = (Stunden × Stundensatz Facharbeiter + Materialwert × Mietsatz × ${GRUNDSTANDZEIT_WOCHEN} Wochen) × (1 + Zuschlag), geteilt durch die Menge. Vorhaltung je Woche = Materialwert × Mietsatz × (1 + Zuschlag), geteilt durch die Menge.`,
      `Gesamt-Standzeit ${de(e.gesamtStandzeitWochen, 0)} Wochen, davon ${GRUNDSTANDZEIT_WOCHEN} Wochen Grundstandzeit.`,
      'Last-, Breiten- und Höhenklasse nach DIN EN 12811-1 (Normtext nicht geprüft). Die Höhenklasse ist eine Eingabe, nicht aus dem CAD berechnet.',
      'Dieses LV ersetzt keine Statik und keine Prüfung durch eine befähigte Person.',
    ],
    fehlendeAngaben: fehlend,
  }
}

export const formatEuro = (v: number): string => de(v, 2) + ' €'
export const formatMenge = (v: number): string => de(v, 2)
