// Strukturierte Rechnungspositionen: Art, Maße (L×B×H), Listenpreis × Faktor, Stundenlohn mit Mitarbeiter und Tätigkeit.
// Der Gesamtpreis bleibt überall Menge × Einzelpreis – der Faktor ist ein Nachweis, wie der Einzelpreis zustande kommt
// (Einzelpreis = Listenpreis × Faktor ÷ 100), kein zweiter Rechenschritt.

export const POSITION_ARTEN = [
  'geruest', 'zusatzarbeitslage', 'rollgeruest', 'haengegeruest', 'gittertraeger', 'konsolen',
  'ausleger', 'plane', 'zelt', 'regie', 'miete', 'aufbau', 'abbau', 'sonstiges',
] as const
export type PositionArt = (typeof POSITION_ARTEN)[number]

export const POSITION_ART_LABEL: Record<PositionArt, string> = {
  geruest: 'Gerüst / Modul', zusatzarbeitslage: 'Zusätzliche Arbeitslage', rollgeruest: 'Rollgerüst', haengegeruest: 'Hängegerüst',
  gittertraeger: 'Gitterträger', konsolen: 'Konsolen', ausleger: 'Ausleger aus Modulgerüst', plane: 'Plane', zelt: 'Zelt',
  regie: 'Stundenlohn (Regie)', miete: 'Miete', aufbau: 'Aufbau', abbau: 'Abbau', sonstiges: 'Sonstiges',
}

export interface StrukturPosition {
  bezeichnung: string
  menge: number
  einheit: string
  einzelpreis: number
  art?: PositionArt
  laengeM?: number
  breiteM?: number
  hoeheM?: number
  /** Preis je Einheit vor dem Faktor */
  listenpreis?: number
  /** Faktor in % (100 = keiner) */
  faktorProzent?: number
  /** Welches Gerüst (z. B. „Hauptgebäude Süd“, „Nebengebäude Ost“) – ordnet die Position eindeutig zu */
  geruestId?: string
  /** Begründung/Zusatzvereinbarung zur Position (z. B. warum eine Sonderleistung nötig war) */
  bemerkung?: string
  /** Stundenlohn: wer hat gearbeitet */
  mitarbeiter?: string
  /** Stundenlohn: was wurde gemacht */
  taetigkeit?: string
}

const zahl = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : undefined
}
const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined
  const t = v.trim().slice(0, max)
  return t || undefined
}
const nichtNegativ = (v: unknown): number | undefined => { const n = zahl(v); return n !== undefined && n >= 0 ? n : undefined }

/** Nimmt nur bekannte Felder mit gültigen Werten an – der Rest wird verworfen (die Positionen landen als JSON in der Datenbank). */
export function bereinigePosition(p: any): StrukturPosition {
  const art = POSITION_ARTEN.includes(p?.art) ? (p.art as PositionArt) : undefined
  const faktor = zahl(p?.faktorProzent)
  const r: StrukturPosition = {
    bezeichnung: String(p?.bezeichnung ?? '').trim().slice(0, 500),
    menge: zahl(p?.menge) ?? 0,
    einheit: String(p?.einheit ?? '').trim().slice(0, 20) || 'Stk.',
    einzelpreis: zahl(p?.einzelpreis) ?? 0,
  }
  if (art) r.art = art
  const l = nichtNegativ(p?.laengeM), b = nichtNegativ(p?.breiteM), h = nichtNegativ(p?.hoeheM)
  if (l) r.laengeM = l
  if (b) r.breiteM = b
  if (h) r.hoeheM = h
  const lp = nichtNegativ(p?.listenpreis)
  if (lp) r.listenpreis = lp
  if (faktor !== undefined && faktor > 0 && faktor <= 1000 && faktor !== 100) r.faktorProzent = faktor
  const g = text(p?.geruestId, 60); if (g) r.geruestId = g
  const bem = text(p?.bemerkung, 1000); if (bem) r.bemerkung = bem
  const m = text(p?.mitarbeiter, 120); if (m) r.mitarbeiter = m
  const t = text(p?.taetigkeit, 500); if (t) r.taetigkeit = t
  return r
}

/** Einzelpreis aus Listenpreis und Faktor, auf Cent gerundet. */
export function preisMitFaktor(listenpreis: number, faktorProzent: number): number {
  return Math.round(listenpreis * faktorProzent) / 100
}

const kommaZahl = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

/** Zusatzzeilen unter der Bezeichnung (Art, Maße, Faktor, Mitarbeiter, Tätigkeit) – für PDF und Prüfansicht. */
export function positionDetailZeilen(p: Partial<StrukturPosition>): string[] {
  const z: string[] = []
  if (p.geruestId) z.push(`Gerüst: ${p.geruestId}`)
  if (p.art && p.art !== 'sonstiges') z.push(POSITION_ART_LABEL[p.art])
  const maße = [p.laengeM, p.breiteM, p.hoeheM].filter((x): x is number => typeof x === 'number' && x > 0)
  if (maße.length) {
    const namen = [p.laengeM ? 'L' : '', p.breiteM ? 'B' : '', p.hoeheM ? 'H' : ''].filter(Boolean).join('×')
    z.push(`${namen}: ${maße.map(kommaZahl).join(' × ')} m`)
  }
  if (p.faktorProzent && p.faktorProzent !== 100) {
    z.push(p.listenpreis ? `Listenpreis ${eur(p.listenpreis)} × Faktor ${kommaZahl(p.faktorProzent)} %` : `Faktor ${kommaZahl(p.faktorProzent)} %`)
  }
  if (p.mitarbeiter) z.push(`Mitarbeiter: ${p.mitarbeiter}`)
  if (p.taetigkeit) z.push(`Tätigkeit: ${p.taetigkeit}`)
  if (p.bemerkung) z.push(`Bemerkung: ${p.bemerkung}`)
  return z
}

// ─── Bearbeiten im Formular (gemeinsam für „Neue Rechnung“, Rechnungsdialog und Rechnungsakte) ───

const TEXTFELDER = ['bezeichnung', 'einheit', 'art', 'mitarbeiter', 'taetigkeit', 'geruestId', 'bemerkung']

/** Ändert ein Feld einer Position. Listenpreis × Faktor ergibt den Einzelpreis; leere Textfelder werden entfernt. Gibt eine neue Position zurück. */
export function aktualisierePosition<T extends Partial<StrukturPosition>>(p: T, feld: keyof StrukturPosition, wert: string): T {
  const neu: any = { ...p, [feld]: TEXTFELDER.includes(feld) ? wert : Number(String(wert).replace(',', '.')) || 0 }
  if ((feld === 'art' || feld === 'geruestId' || feld === 'bemerkung') && !wert) delete neu[feld]
  if ((feld === 'listenpreis' || feld === 'faktorProzent') && Number(neu.listenpreis) > 0) {
    neu.einzelpreis = preisMitFaktor(Number(neu.listenpreis), Number(neu.faktorProzent) || 100)
  }
  return neu
}

export interface MengenVorschlag { label: string; menge: number; einheit: string }

const rund = (n: number) => Math.round(n * 100) / 100

/** Vorschläge für die Menge aus den Maßen. Es wird nichts automatisch übernommen: Ob nach Fläche (L × H) oder Volumen abgerechnet wird, entscheidet der Betrieb. */
export function mengenVorschlaege(p: Partial<StrukturPosition>): MengenVorschlag[] {
  const l = p.laengeM || 0, b = p.breiteM || 0, h = p.hoeheM || 0
  const v: MengenVorschlag[] = []
  if (l > 0 && h > 0) v.push({ label: `L × H = ${kommaZahl(rund(l * h))} m²`, menge: rund(l * h), einheit: 'm²' })
  if (l > 0 && b > 0 && h > 0) v.push({ label: `L × B × H = ${kommaZahl(rund(l * b * h))} m³`, menge: rund(l * b * h), einheit: 'm³' })
  if (l > 0 && b > 0 && !(h > 0)) v.push({ label: `L × B = ${kommaZahl(rund(l * b))} m²`, menge: rund(l * b), einheit: 'm²' })
  if (l > 0 && !(b > 0) && !(h > 0)) v.push({ label: `Länge = ${kommaZahl(rund(l))} m`, menge: rund(l), einheit: 'm' })
  return v
}
