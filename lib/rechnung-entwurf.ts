// ============================================================
// SCAFFOLD OS – Rechnungsentwurf (reine Logik)
//
// Ein Entwurf ist eine gespeicherte, noch nicht festgeschriebene Rechnung OHNE Rechnungsnummer
// (Tabelle invoice_drafts, Phase 122). Gespeichert wird nur, was die Rechnung inhaltlich ausmacht.
// Rechnungsdatum und Fälligkeit werden bewusst NICHT gespeichert: Sie werden beim Festschreiben neu gesetzt.
// Alles andere (Nummer, Freigabe-Pflicht, Steuerprüfung, Beträge) macht unverändert POST /api/invoices.
// ============================================================
import { bereinigePosition } from './rechnung-position'

export type EntwurfArt = 'standard' | 'abschlag' | 'schluss'
export type EntwurfSteuerfall = 'regel' | '13b' | 'kleinunternehmer' | 'lu_tva' | 'ig_lieferung'

export interface EntwurfDaten {
  customer_name: string
  customer_address: string | null
  customer_id: string | null
  project_id: string | null
  lv_id: string | null
  invoice_type: EntwurfArt
  positions: ReturnType<typeof bereinigePosition>[]
  tax_rate: number
  steuerfall: EntwurfSteuerfall
  grundstuecksbezug: boolean
  notes: string | null
  geruest_nr: string | null
  leistungsdatum: string | null
  /** Regieberichte, die in diese Rechnung übernommen wurden (werden erst beim Festschreiben als abgerechnet markiert) */
  regiebericht_ids: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const runde2 = (n: number) => Math.round(n * 100) / 100
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const uuid = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v : null)

export const MAX_ENTWURF_POSITIONEN = 200

/** Netto-Vorschau (Summe Menge × Einzelpreis) für die Liste. */
export function nettoVorschau(positions: { menge: number; einzelpreis: number }[]): number {
  return runde2(positions.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0))
}

export type EntwurfErgebnis = { ok: true; daten: EntwurfDaten; netto: number } | { ok: false; fehler: string }

/** Prüft und bereinigt einen Entwurf aus der Oberfläche. Unvollständiges ist erlaubt – ein Entwurf muss aber irgendeinen Inhalt haben. */
export function bereinigeEntwurf(eingabe: unknown): EntwurfErgebnis {
  if (!eingabe || typeof eingabe !== 'object') return { ok: false, fehler: 'Kein Entwurf übergeben.' }
  const raw = eingabe as Record<string, unknown>
  const rohPositionen: unknown[] = Array.isArray(raw.positions) ? raw.positions : []
  if (rohPositionen.length > MAX_ENTWURF_POSITIONEN) return { ok: false, fehler: `Zu viele Positionen (höchstens ${MAX_ENTWURF_POSITIONEN}).` }
  const positions = rohPositionen.map(bereinigePosition).filter((p) => p.bezeichnung || p.einzelpreis !== 0)
  const name = text(raw.customer_name, 200) || ''
  if (!name && positions.length === 0) return { ok: false, fehler: 'Ein Entwurf braucht mindestens einen Kundennamen oder eine Position.' }
  const art: EntwurfArt = raw.invoice_type === 'abschlag' || raw.invoice_type === 'schluss' ? raw.invoice_type : 'standard'
  const steuerfall: EntwurfSteuerfall = raw.steuerfall === '13b' || raw.steuerfall === 'kleinunternehmer' || raw.steuerfall === 'lu_tva' || raw.steuerfall === 'ig_lieferung' ? raw.steuerfall : 'regel'
  const satz = Number(raw.tax_rate)
  const taxRate = Number.isFinite(satz) && satz >= 0 && satz <= 100 ? satz : 19
  const leistung = typeof raw.leistungsdatum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.leistungsdatum) ? raw.leistungsdatum : null
  const daten: EntwurfDaten = {
    customer_name: name,
    customer_address: text(raw.customer_address, 500),
    customer_id: uuid(raw.customer_id),
    project_id: uuid(raw.project_id),
    lv_id: uuid(raw.lv_id),
    invoice_type: art,
    positions,
    tax_rate: steuerfall === 'lu_tva' ? 17 : steuerfall !== 'regel' ? 0 : taxRate,
    steuerfall,
    grundstuecksbezug: raw.grundstuecksbezug !== false,
    notes: text(raw.notes, 5000),
    geruest_nr: text(raw.geruest_nr, 60),
    leistungsdatum: leistung,
    regiebericht_ids: Array.isArray(raw.regiebericht_ids) ? [...new Set(raw.regiebericht_ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, 50) : [],
  }
  return { ok: true, daten, netto: nettoVorschau(positions) }
}

export const ENTWURF_ART_LABEL: Record<EntwurfArt, string> = { standard: 'Rechnung', abschlag: 'Abschlag', schluss: 'Schlussrechnung' }
