// ============================================================
// SCAFFOLD OS – Steuer- und Pflichtangaben-Logik für Rechnungen (reine Logik)
//
// Eine gemeinsame Quelle für PDF und E-Rechnung (ZUGFeRD/EN 16931): Steuerfall,
// Einheit, Käuferadresse, Leistungsdatum und die Prüfung der Pflichtangaben
// nach § 14 Abs. 4 UStG. Ob § 13b im Einzelfall greift, klärt die Firma mit dem
// Steuerberater; die Software setzt nur um, was an der Rechnung gewählt ist.
// ============================================================
import { HINWEIS_13B } from './ust-hinweis'
export { HINWEIS_19 } from './ust-hinweis'

export type SteuerKategorie = 'S' | 'AE' | 'E'
export const HINWEIS_AUFBEWAHRUNG = 'Hinweis: Sie sind als Privatperson verpflichtet, diese Rechnung für Leistungen im Zusammenhang mit einem Grundstück zwei Jahre lang aufzubewahren (§ 14b Abs. 1 Satz 5 UStG).'
export type Steuerbehandlung = 'regel' | '13b' | 'kleinunternehmer'

/** Aufbewahrungshinweis für Privatpersonen als Leistungsempfänger (Gerüste stehen an einem Grundstück). */
export function aufbewahrungsHinweis(inv: { customer_privat?: boolean | null }): string | null {
  return inv.customer_privat ? HINWEIS_AUFBEWAHRUNG : null
}

export interface SteuerFall { kategorie: SteuerKategorie; satz: number; grund?: string }

/** Steuerfall einer Rechnung: Satz > 0 = Regelsteuer; 0 % je nach Hinweis § 13b (Steuerschuldnerschaft) oder § 19 (Kleinunternehmer). */
export function steuerFall(inv: { tax_rate: unknown; notes?: string | null; steuerfall?: string | null }): SteuerFall {
  const rate = Number(inv.tax_rate)
  const satz = Number.isFinite(rate) ? rate : 19
  if (satz > 0) return { kategorie: 'S', satz }
  const n = inv.notes || ''
  // Die gewählte Steuerbehandlung hat Vorrang; ältere Rechnungen ohne Auswahl werden am Hinweistext erkannt
  if (inv.steuerfall === '13b' || (!inv.steuerfall && n.includes('§ 13b'))) return { kategorie: 'AE', satz: 0, grund: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)' }
  if (inv.steuerfall === 'kleinunternehmer' || (!inv.steuerfall && n.includes('§ 19 UStG'))) return { kategorie: 'E', satz: 0, grund: 'Kleinunternehmer gemäß § 19 UStG' }
  return { kategorie: 'E', satz: 0 }
}

/** Einheit der Position als UN/ECE-Code für die E-Rechnung; unbekannt = „Einheit“ (C62). */
export function einheitZuUnitCode(einheit: string | null | undefined): string {
  const e = (einheit || '').trim().toLowerCase().replace(/\.$/, '')
  if (['m²', 'm2', 'qm'].includes(e)) return 'MTK'
  if (['m', 'lfm', 'lfdm'].includes(e)) return 'MTR'
  if (['m³', 'm3', 'cbm'].includes(e)) return 'MTQ'
  if (['h', 'std', 'stunde', 'stunden'].includes(e)) return 'HUR'
  if (['tag', 'tage', 'd'].includes(e)) return 'DAY'
  if (['wo', 'woche', 'wochen'].includes(e)) return 'WEE'
  if (['monat', 'monate', 'mon'].includes(e)) return 'MON'
  if (['kg'].includes(e)) return 'KGM'
  if (['t'].includes(e)) return 'TNE'
  if (['psch', 'pauschale', 'pausch'].includes(e)) return 'LS'
  if (['stk', 'stück', 'stueck', 'st', 'stck'].includes(e)) return 'H87'
  return 'C62'
}

/** Zerlegt die Anschrift des Empfängers („Straße\nPLZ Ort“) für die E-Rechnung; was nicht eindeutig ist, bleibt in der Zeile 1. */
export function zerlegeAdresse(text: string | null | undefined, fallbackName = ''): { line1: string; postalCode: string; city: string } {
  const zeilen = (text || '').split(/\n|,\s*(?=\d{5}\s)/).map((z) => z.trim()).filter(Boolean)
  const letzte = zeilen[zeilen.length - 1] || ''
  const m = letzte.match(/^(?:D-)?(\d{5})\s+(.+)$/)
  if (m && zeilen.length >= 2) return { line1: zeilen.slice(0, -1).join(', '), postalCode: m[1], city: m[2] }
  return { line1: zeilen.join(', ') || fallbackName, postalCode: '', city: '' }
}

/** Leistungsdatum der Rechnung; ohne eigene Angabe gilt das Rechnungsdatum (so steht es dann auch auf dem Beleg). */
export function leistungsdatumFuer(inv: { leistungsdatum?: string | null; invoice_date: string }): { datum: string; eigene: boolean } {
  return inv.leistungsdatum ? { datum: inv.leistungsdatum, eigene: true } : { datum: inv.invoice_date, eigene: false }
}

export interface PflichtLuecke { code: string; text: string }

/** Prüft die Pflichtangaben einer Rechnung nach § 14 Abs. 4 UStG (Rechnungen ab 250 € brutto; darunter genügen die Angaben nach § 33 UStDV). */
export function pruefePflichtangaben(inv: {
  invoice_number?: string | null; invoice_date?: string | null; customer_name?: string | null; customer_address?: string | null
  positions?: { bezeichnung?: string; menge?: number }[] | null; tax_rate: unknown; notes?: string | null; gross_amount?: unknown
  invoice_type?: string | null; reference_invoice_number?: string | null; company_snapshot?: any
}): PflichtLuecke[] {
  const l: PflichtLuecke[] = []
  const cs = inv.company_snapshot || {}
  const klein = Math.abs(Number(inv.gross_amount)) <= 250
  if (!cs.company_name) l.push({ code: 'AUSSTELLER_NAME', text: 'Name des Rechnungsausstellers fehlt (Einstellungen).' })
  if (!cs.street || !cs.zip || !cs.city) l.push({ code: 'AUSSTELLER_ANSCHRIFT', text: 'Anschrift des Rechnungsausstellers unvollständig (Einstellungen).' })
  if (!cs.steuer_nr && !cs.ust_id) l.push({ code: 'STEUERNUMMER', text: 'Steuernummer oder USt-IdNr. des Ausstellers fehlt (Einstellungen).' })
  if (!inv.invoice_number) l.push({ code: 'RECHNUNGSNUMMER', text: 'Rechnungsnummer fehlt.' })
  if (!inv.invoice_date) l.push({ code: 'RECHNUNGSDATUM', text: 'Rechnungsdatum fehlt.' })
  if (!inv.customer_name) l.push({ code: 'EMPFAENGER_NAME', text: 'Name des Rechnungsempfängers fehlt.' })
  if (!klein && !(inv.customer_address || '').trim()) l.push({ code: 'EMPFAENGER_ANSCHRIFT', text: 'Anschrift des Rechnungsempfängers fehlt.' })
  const pos = inv.positions || []
  if (!pos.length || pos.some((p) => !(p.bezeichnung || '').trim())) l.push({ code: 'LEISTUNGSBESCHREIBUNG', text: 'Menge und Art der Leistung: jede Position braucht eine Bezeichnung.' })
  const f = steuerFall(inv)
  if (f.kategorie === 'E' && !f.grund) l.push({ code: 'STEUERBEFREIUNG', text: 'Steuersatz 0 %: Hinweis auf den Grund (z. B. § 13b UStG oder § 19 UStG) fehlt.' })
  if (f.kategorie === 'AE' && !cs.ust_id) l.push({ code: 'USTID_13B', text: 'Bei § 13b UStG ist die USt-IdNr. des Ausstellers anzugeben.' })
  if (inv.invoice_type === 'gutschrift' && !inv.reference_invoice_number) l.push({ code: 'GUTSCHRIFT_BEZUG', text: 'Gutschrift ohne Bezug auf die ursprüngliche Rechnung.' })
  return l
}
