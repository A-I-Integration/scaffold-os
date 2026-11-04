// ============================================================
// SCAFFOLD OS – Bauphasen: Aufbau-/Abbau-Termine, Teilrückbau, Kostenaufteilung, Lager, Personal (reine Logik)
//
// Alles wird von Hand eingestellt; das System rechnet den Rest:
//   • Phase = Aufbau ODER Abbau (auch Teilrückbau) mit Datum, Menge in m² und Dauer
//   • Preis je m² (Montage + Demontage) wird nach dem Aufbau-Anteil aufgeteilt (z. B. 65 % Aufbau / 35 % Abbau);
//     jede Phase kann den Anteil oder den Betrag von Hand überschreiben
//   • Lager: Material je Phase anteilig nach m² (Aufbau = raus, Abbau = zurück), als Bestand draußen je Datum
//   • Personal: Stunden je Phase anteilig nach m² aus den Gesamtstunden, Arbeitstage und Köpfe je Tag
// Rechenregeln stehen im Ergebnis unter „annahmen“, damit nichts verdeckt passiert. Beträge netto.
// ============================================================
import { arbeitstage } from '@/lib/einsatz-planung'

export type PhasenArt = 'aufbau' | 'abbau'

export interface Bauphase {
  id: string
  art: PhasenArt
  /** erster Arbeitstag (YYYY-MM-DD) */
  datum: string
  /** Menge dieser Phase in m² (bei Abbau: zurückgebaute Teilfläche) */
  flaecheM2: number
  /** Dauer in Arbeitstagen; leer = aus Stunden und Personen berechnet */
  tageManuell?: number
  /** Personen auf dieser Phase; leer = Standard */
  personen?: number
  /** Anteil der Phase am Preis in % (überschreibt den Aufbau-/Abbau-Standard) */
  anteilProzentManuell?: number
  /** fester Betrag netto (überschreibt alles andere) */
  betragManuell?: number
  notiz?: string
  /** gesetzt, sobald die Phase abgerechnet wurde */
  rechnungId?: string
  rechnungNr?: string
  abgerechnetAm?: string
}

export interface BauphasenEinstellung {
  /** Gesamtfläche des Gerüsts in m² */
  gesamtFlaecheM2: number
  /** Preis je m² für Montage + Demontage zusammen, netto */
  preisJeM2: number
  /** Anteil Aufbau in % (Standard 65); Rest ist Abbau */
  aufbauAnteilProzent: number
  /** Gesamtstunden für kompletten Aufbau bzw. Abbau (z. B. aus dem CAD); 0 = unbekannt */
  aufbauStundenGesamt: number
  abbauStundenGesamt: number
  /** Standard-Personen je Phase */
  standardPersonen: number
  /** Stunden je Mitarbeiter und Tag */
  stundenJeTag: number
  /** Material für das komplette Gerüst */
  material: { artikel: string; name: string; menge: number; einheit: string }[]
}

export const BAUPHASEN_STANDARD: BauphasenEinstellung = {
  gesamtFlaecheM2: 0, preisJeM2: 0, aufbauAnteilProzent: 65, aufbauStundenGesamt: 0, abbauStundenGesamt: 0,
  standardPersonen: 2, stundenJeTag: 8, material: [],
}

const r2 = (n: number) => Math.round(n * 100) / 100
const pos = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

export interface PhaseErgebnis {
  id: string
  art: PhasenArt
  datum: string
  flaecheM2: number
  /** Anteil der Phase an der Gesamtfläche (0..1) */
  mengenAnteil: number
  /** Betrag netto dieser Phase */
  betrag: number
  /** angewandter Prozentsatz vom Preis (Aufbau/Abbau-Standard oder Handwert); bei festem Betrag null */
  anteilProzent: number | null
  stunden: number
  personen: number
  tage: number
  /** Arbeitstage mit Köpfen */
  einsatzTage: string[]
  /** Material dieser Phase (Aufbau: entnehmen, Abbau: zurück) */
  material: { artikel: string; name: string; menge: number; einheit: string }[]
}

export interface BestandPunkt { datum: string; stehendM2: number; aufgebautM2: number; zurueckM2: number }
export interface LagerPunkt { datum: string; artikel: string; name: string; einheit: string; draussen: number }
export interface PersonalTag { datum: string; koepfe: number }

export interface BauphasenErgebnis {
  phasen: PhaseErgebnis[]
  summeBetrag: number
  summeAufbau: number
  summeAbbau: number
  /** nach Preis und Gesamtfläche erwarteter Gesamtbetrag */
  sollBetrag: number
  /** Differenz Summe – Soll (Handwerte können vom Soll abweichen) */
  abweichung: number
  bestand: BestandPunkt[]
  lager: LagerPunkt[]
  personal: PersonalTag[]
  warnungen: string[]
  annahmen: string[]
}

/** Prüft die Reihenfolge der Mengen: Abbau nie mehr als bis dahin aufgebaut, Aufbau nie mehr als Gesamtfläche. */
function pruefe(phasen: Bauphase[], e: BauphasenEinstellung): string[] {
  const w: string[] = []
  const sortiert = [...phasen].sort((a, b) => a.datum.localeCompare(b.datum) || (a.art === 'aufbau' ? -1 : 1))
  let auf = 0, ab = 0
  for (const p of sortiert) {
    if (p.art === 'aufbau') auf += pos(p.flaecheM2); else ab += pos(p.flaecheM2)
    if (ab > auf + 0.005) w.push(`Abbau am ${p.datum}: insgesamt ${r2(ab)} m² zurückgebaut, aber erst ${r2(auf)} m² aufgebaut.`)
  }
  if (e.gesamtFlaecheM2 > 0 && auf > e.gesamtFlaecheM2 + 0.005) w.push(`Aufbau insgesamt ${r2(auf)} m² ist größer als die Gesamtfläche ${r2(e.gesamtFlaecheM2)} m².`)
  if (phasen.some((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.datum))) w.push('Mindestens eine Phase hat kein gültiges Datum.')
  return w
}

export function berechneBauphasen(phasenEin: Bauphase[], einst: Partial<BauphasenEinstellung> = {}): BauphasenErgebnis {
  const e: BauphasenEinstellung = { ...BAUPHASEN_STANDARD, ...einst }
  const gesamt = pos(e.gesamtFlaecheM2)
  const preis = pos(e.preisJeM2)
  const aufP = Math.min(100, Math.max(0, Number.isFinite(e.aufbauAnteilProzent) ? e.aufbauAnteilProzent : 65))
  const phasen = phasenEin.filter((p) => pos(p.flaecheM2) > 0 || p.betragManuell !== undefined)
  const tagStd = pos(e.stundenJeTag) || 8

  const ergebnis: PhaseErgebnis[] = phasen.map((p) => {
    const m2 = pos(p.flaecheM2)
    const mengenAnteil = gesamt > 0 ? m2 / gesamt : 0
    const standardP = p.art === 'aufbau' ? aufP : 100 - aufP
    let betrag: number, anteilProzent: number | null
    if (typeof p.betragManuell === 'number' && Number.isFinite(p.betragManuell)) { betrag = r2(p.betragManuell); anteilProzent = null }
    else { anteilProzent = typeof p.anteilProzentManuell === 'number' && Number.isFinite(p.anteilProzentManuell) ? p.anteilProzentManuell : standardP; betrag = r2(m2 * preis * (anteilProzent / 100)) }
    const gesamtStd = p.art === 'aufbau' ? pos(e.aufbauStundenGesamt) : pos(e.abbauStundenGesamt)
    const stunden = r2(gesamtStd * mengenAnteil)
    const personen = Math.max(1, Math.round(pos(p.personen) || pos(e.standardPersonen) || 1))
    const tage = pos(p.tageManuell) ? Math.max(1, Math.ceil(pos(p.tageManuell))) : stunden > 0 ? Math.max(1, Math.ceil(stunden / (personen * tagStd))) : 0
    const einsatzTage = tage > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.datum) ? arbeitstage(p.datum, tage) : []
    const material = e.material.map((m) => ({ artikel: m.artikel, name: m.name, einheit: m.einheit, menge: Math.ceil(m.menge * mengenAnteil * 100) / 100 })).filter((m) => m.menge > 0)
    return { id: p.id, art: p.art, datum: p.datum, flaecheM2: m2, mengenAnteil, betrag, anteilProzent, stunden, personen, tage, einsatzTage, material }
  }).sort((a, b) => a.datum.localeCompare(b.datum) || (a.art === 'aufbau' ? -1 : 1))

  const summeAufbau = r2(ergebnis.filter((p) => p.art === 'aufbau').reduce((s, p) => s + p.betrag, 0))
  const summeAbbau = r2(ergebnis.filter((p) => p.art === 'abbau').reduce((s, p) => s + p.betrag, 0))
  const summeBetrag = r2(summeAufbau + summeAbbau)
  const sollBetrag = r2(gesamt * preis)

  // Bestand je Datum (kumuliert)
  const daten = [...new Set(ergebnis.map((p) => p.datum))].sort()
  let auf = 0, ab = 0
  const bestand: BestandPunkt[] = daten.map((d) => {
    for (const p of ergebnis.filter((x) => x.datum === d)) { if (p.art === 'aufbau') auf += p.flaecheM2; else ab += p.flaecheM2 }
    return { datum: d, aufgebautM2: r2(auf), zurueckM2: r2(ab), stehendM2: r2(Math.max(0, auf - ab)) }
  })

  // Lager: Material draußen je Datum (Aufbau +, Abbau −)
  const lager: LagerPunkt[] = []
  const stand = new Map<string, { name: string; einheit: string; draussen: number }>()
  for (const d of daten) {
    for (const p of ergebnis.filter((x) => x.datum === d)) for (const m of p.material) {
      const s = stand.get(m.artikel) ?? { name: m.name, einheit: m.einheit, draussen: 0 }
      s.draussen = r2(Math.max(0, s.draussen + (p.art === 'aufbau' ? m.menge : -m.menge)))
      stand.set(m.artikel, s)
    }
    for (const [artikel, s] of stand) lager.push({ datum: d, artikel, name: s.name, einheit: s.einheit, draussen: s.draussen })
  }

  // Personal: Köpfe je Arbeitstag (mehrere Phasen am selben Tag addieren sich)
  const tageMap = new Map<string, number>()
  for (const p of ergebnis) for (const t of p.einsatzTage) tageMap.set(t, (tageMap.get(t) ?? 0) + p.personen)
  const personal: PersonalTag[] = [...tageMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([datum, koepfe]) => ({ datum, koepfe }))

  const warnungen = pruefe(phasen, e)
  if (gesamt === 0) warnungen.push('Gesamtfläche fehlt – Mengenanteile, Stunden und Material können nicht verteilt werden.')
  if (preis === 0) warnungen.push('Preis je m² fehlt – die Beträge sind 0.')
  if (Math.abs(summeBetrag - sollBetrag) > 0.01 && sollBetrag > 0 && warnungen.every((x) => !x.startsWith('Aufbau insgesamt'))) {
    const aufM2 = ergebnis.filter((p) => p.art === 'aufbau').reduce((s, p) => s + p.flaecheM2, 0)
    if (aufM2 >= gesamt - 0.005 && ergebnis.filter((p) => p.art === 'abbau').reduce((s, p) => s + p.flaecheM2, 0) >= gesamt - 0.005) warnungen.push(`Summe ${summeBetrag.toFixed(2)} € weicht vom Soll ${sollBetrag.toFixed(2)} € ab (Handwerte).`)
  }

  const annahmen = [
    `Preis je m² (Montage + Demontage) ${preis.toFixed(2)} € wird zu ${aufP} % auf den Aufbau und zu ${100 - aufP} % auf den Abbau verteilt; Betrag je Phase = Menge × Preis × Anteil.`,
    'Stunden, Material und Personal je Phase werden nach dem Mengenanteil (m² der Phase ÷ Gesamtfläche) aus den Gesamtwerten verteilt.',
    `Dauer = Stunden ÷ (Personen × ${tagStd} h), aufgerundet, nur Mo–Fr; von Hand eingegebene Tage haben Vorrang.`,
    'Lager: Aufbau entnimmt das anteilige Material, Abbau bringt es zurück; „draußen“ = Bestand auf der Baustelle.',
  ]
  return { phasen: ergebnis, summeBetrag, summeAufbau, summeAbbau, sollBetrag, abweichung: r2(summeBetrag - sollBetrag), bestand, lager, personal, warnungen, annahmen }
}

/** Lesen aus gespeicherten Daten (projects.data.bauphasen): fehlerhafte Einträge werden verworfen */
export function normalisiereBauphasen(raw: unknown): Bauphase[] {
  if (!Array.isArray(raw)) return []
  const aus: Bauphase[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    if ((o.art !== 'aufbau' && o.art !== 'abbau') || typeof o.datum !== 'string' || typeof o.id !== 'string') continue
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    aus.push({ id: o.id, art: o.art, datum: o.datum, flaecheM2: num(o.flaecheM2) ?? 0, tageManuell: num(o.tageManuell), personen: num(o.personen), anteilProzentManuell: num(o.anteilProzentManuell), betragManuell: num(o.betragManuell), notiz: typeof o.notiz === 'string' ? o.notiz : undefined,
      ...(typeof o.rechnungId === 'string' ? { rechnungId: o.rechnungId } : {}), ...(typeof o.rechnungNr === 'string' ? { rechnungNr: o.rechnungNr } : {}), ...(typeof o.abgerechnetAm === 'string' ? { abgerechnetAm: o.abgerechnetAm } : {}) })
  }
  return aus
}

const fmtDe = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const datumDe = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE') }

/** Rechnungsposition für eine Phase (Abschlagsrechnung nach Bauphase). Genau der berechnete Betrag; bei Rundungsdifferenz als Pauschale. */
export function baueBauphasenPosition(phase: Bauphase, erg: PhaseErgebnis): { position: { bezeichnung: string; menge: number; einheit: string; einzelpreis: number } | null; fehler: string | null } {
  if (phase.rechnungId) return { position: null, fehler: `Diese Phase ist bereits mit Rechnung ${phase.rechnungNr || ''} abgerechnet.`.replace('  ', ' ') }
  if (!(erg.betrag > 0)) return { position: null, fehler: 'Für diese Phase gibt es keinen Betrag (Preis je m², Menge oder Betrag prüfen).' }
  const art = phase.art === 'aufbau' ? 'Aufbau' : 'Abbau / Teilrückbau'
  const anteil = erg.anteilProzent === null ? 'fester Betrag' : `${erg.anteilProzent.toLocaleString('de-DE')} % des Preises`
  const bez = `${art} ab ${datumDe(phase.datum)}: ${fmtDe(erg.flaecheM2)} m² (${anteil})`
  const einzel = erg.flaecheM2 > 0 ? Math.round((erg.betrag / erg.flaecheM2) * 100) / 100 : 0
  if (erg.flaecheM2 > 0 && Math.abs(Math.round(erg.flaecheM2 * einzel * 100) / 100 - erg.betrag) < 0.005) return { position: { bezeichnung: bez, menge: erg.flaecheM2, einheit: 'm²', einzelpreis: einzel }, fehler: null }
  return { position: { bezeichnung: bez, menge: 1, einheit: 'Pauschale', einzelpreis: erg.betrag }, fehler: null }
}

export function markiereBauphaseAbgerechnet(phasen: Bauphase[], id: string, rechnung: { id: string; nummer: string }, heute: string): Bauphase[] {
  return phasen.map((p) => (p.id === id ? { ...p, rechnungId: rechnung.id, rechnungNr: rechnung.nummer, abgerechnetAm: heute } : p))
}
