// ============================================================
// SCAFFOLD OS – Auftragsstand einer Baustelle (reine Logik)
//
// Fasst zusammen, wo ein Auftrag abrechnungstechnisch steht:
//   Auftragswert  = Angebot (netto) + vom Kunden bestätigte Nachträge/Verlängerungen
//   Abgerechnet   = Summe der gültigen Rechnungen (netto). Die Schlussrechnung weist nur den
//                   Rest nach Abzug der Abschläge aus, daher zählt die Summe nicht doppelt.
//   Noch offen    = Auftragswert − abgerechnet (nie negativ)
// Alle Beträge netto, außer „bezahlt/offen" (brutto, wie auf der Rechnung).
// Stornierte Rechnungen zählen nicht; Gutschriften mindern (Betrag ist dort negativ gespeichert).
// ============================================================

import { berechneForderung, bezahltAnteil } from './forderung'
import { baueRechnungsPositionen, eingabeAusProjektData, summeNetto } from './schlussrechnung'

export interface StandRechnung {
  id: string
  invoice_number: string
  invoice_type?: string | null
  status: string
  invoice_date: string
  due_date?: string | null
  net_amount: number
  gross_amount: number
  paid_amount?: number | null
  reference_invoice_number?: string | null
  reminder_level?: number | null
  erinnerung_am?: string | null
  mahnung_pausiert?: boolean | null
  mahnung_pause_grund?: string | null
  positions?: { art?: string }[] | null
}

export interface StandNachtrag { betrag: number; status: string }

export interface Auftragsstand {
  angebotNetto: number
  nachtraegeBestaetigt: number
  nachtraegeOffen: number
  auftragswert: number
  abgerechnet: number
  restZuAbrechnen: number
  prozentAbgerechnet: number | null   // null, wenn kein Auftragswert bekannt
  bezahlt: number                     // brutto
  offenBrutto: number                 // brutto, noch nicht bezahlt
  ueberfaellig: number                // brutto, fällig und unbezahlt
  guthaben: number                    // brutto, Gutschrift über den offenen Betrag hinaus (Kunde hat Anspruch)
  ungeklaertGutschrift: number        // brutto, Gutschriften ohne Bezugsrechnung (mindern nichts)
  anzahlGueltig: number
  /** Vorhaltung (Miete), netto – gehört nicht zum Auftragswert und steht nicht in „abgerechnet“ */
  vorhaltungNetto: number
}

const runde = (n: number) => Math.round(n * 100) / 100
const zahl = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0 }

export function istGueltig(r: Pick<StandRechnung, 'status'>): boolean {
  return r.status !== 'storniert'
}

export function bezahltBrutto(r: StandRechnung): number { return bezahltAnteil(r) }

export function berechneAuftragsstand(args: {
  angebotNetto: number
  nachtraege: StandNachtrag[]
  rechnungen: StandRechnung[]
  heute?: string // YYYY-MM-DD
}): Auftragsstand {
  const heute = args.heute ?? new Date().toISOString().slice(0, 10)
  const gueltig = args.rechnungen.filter(istGueltig)
  const nb = runde(args.nachtraege.filter(n => n.status === 'bestaetigt').reduce((s, n) => s + zahl(n.betrag), 0))
  const no = runde(args.nachtraege.filter(n => n.status === 'offen').reduce((s, n) => s + zahl(n.betrag), 0))
  const angebot = runde(zahl(args.angebotNetto))
  const wert = runde(angebot + nb)
  const istVorh = (r: StandRechnung) => Array.isArray(r.positions) && r.positions.length > 0 && r.positions.every((p) => p?.art === 'miete')
  const abger = runde(gueltig.filter((r) => !istVorh(r)).reduce((s, r) => s + zahl(r.net_amount), 0))
  const vorh = runde(gueltig.filter(istVorh).reduce((s, r) => s + zahl(r.net_amount), 0))
  // Offene Forderung zentral (lib/forderung.ts): Rechnungen − Zahlungen − Gutschriften, stornierte zählen nicht
  const ford = berechneForderung(args.rechnungen, { heute })
  return {
    angebotNetto: angebot,
    nachtraegeBestaetigt: nb,
    nachtraegeOffen: no,
    auftragswert: wert,
    abgerechnet: abger,
    restZuAbrechnen: wert > 0 ? Math.max(0, runde(wert - abger)) : 0,
    prozentAbgerechnet: wert > 0 ? Math.round((abger / wert) * 1000) / 10 : null,
    bezahlt: ford.bezahlt,
    offenBrutto: ford.offen,
    ueberfaellig: ford.ueberfaellig,
    guthaben: ford.guthaben,
    ungeklaertGutschrift: ford.ungeklaert,
    anzahlGueltig: gueltig.length,
    vorhaltungNetto: vorh,
  }
}

export const TYP_LABEL: Record<string, string> = { standard: 'Rechnung', abschlag: 'Teilrechnung (Abschlag)', schluss: 'Schlussrechnung', gutschrift: 'Gutschrift' }

/** Gültige und stornierte Rechnungen in Reihenfolge: Datum aufsteigend, dann Nummer. */
export function sortiereRechnungen<T extends Pick<StandRechnung, 'invoice_date' | 'invoice_number'>>(liste: T[]): T[] {
  return [...liste].sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || String(a.invoice_number).localeCompare(String(b.invoice_number)))
}

/** Angebotswert netto aus den gespeicherten Projektdaten (0, wenn kein Angebot hinterlegt ist). */
export function angebotNettoAusProjekt(data: any, kranTagessatz: number): number {
  if (!data?.kiResult && !data?.festpreisProM2 && !data?.pauschale) return 0
  try { return summeNetto(baueRechnungsPositionen({ eingabe: eingabeAusProjektData(data, kranTagessatz), basis: 'angebot' })) } catch { return 0 }
}

export const auftragUrl = (origin: string, token: string): string => `${origin.replace(/\/$/, '')}/auftrag/${token}`
