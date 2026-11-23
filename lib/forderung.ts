// ============================================================
// SCAFFOLD OS – Offene Forderung (zentrale Berechnung, reine Logik; Faktura OFFEN-2)
//
// EINE Rechnung dafür für alle Anzeigen (Auftragsstand, Kontrolle, Kundenansicht, Faktura-Übersicht):
//   offen je Rechnung = Rechnungsbetrag brutto − bezahlt − Gutschriften, die sich auf diese Rechnung beziehen (nie unter 0)
// Regeln:
//   • Stornierte Rechnungen und stornierte Gutschriften zählen nicht.
//   • Eine Gutschrift mindert genau EINE Rechnung: die mit ihrer Bezugsnummer. Der Abzug ist auf den dort noch offenen Betrag begrenzt;
//     ein Überhang (Rechnung bereits bezahlt) ist ein Guthaben des Kunden und mindert keine andere Rechnung.
//   • Bezieht sich eine Gutschrift auf eine stornierte Rechnung, wird sie nicht abgezogen (die Rechnung steht schon nicht mehr in der
//     Forderung; sonst wäre derselbe Betrag doppelt verrechnet).
//   • Eine Gutschrift ohne auffindbare Bezugsrechnung wird NIE einer Rechnung, Baustelle oder einem Kunden zugeschlagen. Sie steht
//     getrennt als „ungeklärte Gutschrift“ (`ungeklaert`) und mindert keine Forderung, bis sie eindeutig zugeordnet ist.
//   • Gutschriften sind negativ gespeichert; verrechnet wird ihr Betrag.
//   • Auftragswert, abgerechnet und offene Forderung sind verschiedene Kennzahlen und werden nicht vermischt.
// ============================================================

export interface ForderungRechnung {
  id?: string
  invoice_number?: string | null
  invoice_type?: string | null
  status: string
  due_date?: string | null
  gross_amount?: number | string | null
  paid_amount?: number | string | null
  reference_invoice_number?: string | null
}

export interface Forderung {
  bezahlt: number
  offen: number
  ueberfaellig: number
  /** Summe der verrechneten Gutschriften (brutto) */
  gutschriftAbzug: number
  /** Guthaben des Kunden: Gutschrift übersteigt den noch offenen Betrag der Rechnung */
  guthaben: number
  /** Gutschriften ohne auffindbare Bezugsrechnung (brutto): nicht zugeordnet, mindern keine Forderung */
  ungeklaert: number
  /** Verrechnete Gutschriften je Rechnung (brutto, Schlüssel wie `je`) */
  gutschriftJe: Map<string, number>
  /** Offener Betrag je Rechnung (Schlüssel: id, sonst Rechnungsnummer); nur Rechnungen, keine Gutschriften */
  je: Map<string, number>
}

const runde = (n: number) => Math.round(n * 100) / 100
const zahl = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0 }
const schluessel = (r: ForderungRechnung) => String(r.id ?? r.invoice_number ?? '')

export const istGutschriftBeleg = (r: Pick<ForderungRechnung, 'invoice_type'>) => r.invoice_type === 'gutschrift'

/** Bezahlter Betrag brutto einer Rechnung (Status „bezahlt“ = voller Betrag; nie mehr als der Rechnungsbetrag). */
export function bezahltAnteil(r: ForderungRechnung): number {
  const gross = zahl(r.gross_amount)
  if (gross < 0) return 0
  const p = zahl(r.paid_amount)
  // „bezahlt“ ohne gebuchte Zahlung (ältere Daten): voller Betrag. Mit gebuchter Zahlung zählt die Zahlung – eine Gutschrift ist keine Zahlung.
  if (r.status === 'bezahlt') return p > 0 ? Math.min(p, gross) : gross
  return Math.min(Math.max(p, 0), gross)
}

export function berechneForderung(rechnungen: ForderungRechnung[], opt: { heute?: string } = {}): Forderung {
  const heute = opt.heute ?? new Date().toISOString().slice(0, 10)
  const alle = rechnungen
  const gueltig = alle.filter((r) => r.status !== 'storniert')
  const rechn = gueltig.filter((r) => !istGutschriftBeleg(r))
  const gutsch = gueltig.filter(istGutschriftBeleg)
  const nummernGueltig = new Set(rechn.map((r) => String(r.invoice_number ?? '')))
  const nummernStorniert = new Set(alle.filter((r) => r.status === 'storniert' && !istGutschriftBeleg(r)).map((r) => String(r.invoice_number ?? '')))

  const rest = new Map<string, number>()
  let bezahlt = 0, ueberzahlung = 0
  for (const r of rechn) {
    const b = bezahltAnteil(r)
    bezahlt += b
    // Überzahlung (z. B. importierte Daten): der Mehrbetrag ist Guthaben des Kunden, keine negative Forderung
    if (r.status !== 'bezahlt' && zahl(r.gross_amount) >= 0 && zahl(r.paid_amount) > zahl(r.gross_amount) + 0.005) ueberzahlung += zahl(r.paid_amount) - zahl(r.gross_amount)
    rest.set(schluessel(r), Math.max(0, runde(zahl(r.gross_amount) - b)))
  }

  // Gutschriften je Bezugsrechnung zusammenfassen
  const jeBezug = new Map<string, number>()
  let unbezogen = 0
  for (const g of gutsch) {
    const betrag = Math.abs(zahl(g.gross_amount))
    const ref = String(g.reference_invoice_number ?? '')
    if (ref && nummernGueltig.has(ref)) jeBezug.set(ref, runde((jeBezug.get(ref) ?? 0) + betrag))
    else if (ref && nummernStorniert.has(ref)) continue            // Bezug storniert: schon nicht mehr in der Forderung
    else unbezogen = runde(unbezogen + betrag)
  }

  let abzug = 0, guthaben = 0
  const gutschriftJe = new Map<string, number>()
  for (const r of rechn) {
    const nr = String(r.invoice_number ?? '')
    const g = jeBezug.get(nr)
    if (!g) continue
    // mehrere Rechnungen mit gleicher Nummer sind nicht vorgesehen; der Abzug gilt der ersten, die noch offen ist
    const k = schluessel(r)
    const offen = rest.get(k) ?? 0
    const verrechnet = Math.min(g, offen)
    rest.set(k, runde(offen - verrechnet)); abzug += verrechnet; gutschriftJe.set(k, runde(verrechnet))
    guthaben += runde(g - verrechnet)
    jeBezug.delete(nr)
  }

  let offen = 0, ueber = 0
  for (const r of rechn) {
    const v = rest.get(schluessel(r)) ?? 0
    offen += v
    if (v > 0 && (r.status === 'ueberfaellig' || (r.due_date && String(r.due_date).slice(0, 10) < heute))) ueber += v
  }
  return { bezahlt: runde(bezahlt), offen: runde(offen), ueberfaellig: runde(ueber), gutschriftAbzug: runde(abzug), guthaben: runde(guthaben + ueberzahlung), ungeklaert: runde(unbezogen), je: rest, gutschriftJe }
}

// ─── Gutschriften zur Auswahl dazunehmen (unabhängig von Baustelle, Kunde oder geladener Liste) ───

/**
 * Eine Ansicht zeigt nur einen Ausschnitt der Rechnungen (Baustelle, Kunde, Filter). Eine Gutschrift gehört aber zu ihrer Bezugsrechnung,
 * egal in welchem Ausschnitt sie selbst liegt. Diese Funktion ergänzt die Auswahl um alle Gutschriften aus `alle`, deren Bezugsnummer zu einer
 * Rechnung der Auswahl passt. Gutschriften ohne passende Rechnung in der Auswahl werden NICHT ergänzt (sie bleiben dort, wo sie sind).
 */
export function mitBezugsGutschriften<T extends ForderungRechnung>(auswahl: T[], alle: T[]): T[] {
  const nummern = new Set(auswahl.filter((r) => !istGutschriftBeleg(r)).map((r) => String(r.invoice_number ?? '')).filter(Boolean))
  const drin = new Set(auswahl.map((r) => schluessel(r)))
  const dazu = alle.filter((g) => istGutschriftBeleg(g) && !drin.has(schluessel(g)) && g.reference_invoice_number && nummern.has(String(g.reference_invoice_number)))
  return dazu.length ? [...auswahl, ...dazu] : auswahl
}

// ─── Rechnungsstatus aus der Forderung ───

export type ForderungsStatus = 'storniert' | 'gutschrift' | 'bezahlt' | 'ausgeglichen' | 'teilbezahlt' | 'teilausgeglichen' | 'ueberfaellig' | 'offen'

export const FORDERUNGSSTATUS_LABEL: Record<ForderungsStatus, string> = {
  storniert: 'storniert', gutschrift: 'Gutschrift', bezahlt: 'bezahlt', ausgeglichen: 'ausgeglichen (Gutschrift)', teilbezahlt: 'teilbezahlt',
  teilausgeglichen: 'teilweise gutgeschrieben', ueberfaellig: 'überfällig', offen: 'offen',
}

/**
 * Status einer Rechnung aus Zahlungen und Gutschriften (nicht aus dem gespeicherten Status allein):
 *   storniert → nie „bezahlt“; Gutschrift → eigener Beleg, keine Zahlung;
 *   nichts mehr offen: nur durch Zahlung → bezahlt, mit Gutschrift beteiligt → ausgeglichen;
 *   noch offen: Zahlung vorhanden → teilbezahlt, nur Gutschrift → teilausgeglichen, sonst überfällig/offen.
 */
export function forderungsStatus(r: ForderungRechnung, offen: number, gutschrift: number, heute: string = new Date().toISOString().slice(0, 10)): ForderungsStatus {
  if (r.status === 'storniert') return 'storniert'
  if (istGutschriftBeleg(r)) return 'gutschrift'
  const bezahlt = bezahltAnteil(r)
  if (offen <= 0.005) return gutschrift > 0.005 ? 'ausgeglichen' : 'bezahlt'
  if (r.status === 'ueberfaellig' || (r.due_date && String(r.due_date).slice(0, 10) < heute)) return 'ueberfaellig'
  if (bezahlt > 0.005) return 'teilbezahlt'
  return gutschrift > 0.005 ? 'teilausgeglichen' : 'offen'
}

/** Status je Rechnung (Schlüssel id) für eine Liste; Gutschriften und stornierte Belege inklusive. */
export function statusJe(rechnungen: ForderungRechnung[], heute?: string): Map<string, ForderungsStatus> {
  const f = berechneForderung(rechnungen, { heute })
  const out = new Map<string, ForderungsStatus>()
  for (const r of rechnungen) {
    const k = schluessel(r)
    out.set(k, forderungsStatus(r, f.je.get(k) ?? 0, f.gutschriftJe.get(k) ?? 0, heute))
  }
  return out
}
