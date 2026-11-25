// ============================================================
// SCAFFOLD OS – Steuer- und Pflichtangaben-Logik für Rechnungen (reine Logik)
//
// Eine gemeinsame Quelle für PDF und E-Rechnung (ZUGFeRD/EN 16931): Steuerfall,
// Einheit, Käuferadresse, Leistungsdatum und die Prüfung der Pflichtangaben
// nach § 14 Abs. 4 UStG. Ob § 13b im Einzelfall greift, klärt die Firma mit dem
// Steuerberater; die Software setzt nur um, was an der Rechnung gewählt ist.
// ============================================================
import { HINWEIS_13B, HINWEIS_IG } from './ust-hinweis'
export { HINWEIS_19 } from './ust-hinweis'

export type SteuerKategorie = 'S' | 'AE' | 'E' | 'K'
export const HINWEIS_AUFBEWAHRUNG = 'Hinweis: Sie sind als Privatperson verpflichtet, diese Rechnung für Leistungen im Zusammenhang mit einem Grundstück zwei Jahre lang aufzubewahren (§ 14b Abs. 1 Satz 5 UStG).'
export type Steuerbehandlung = 'regel' | '13b' | 'kleinunternehmer' | 'lu_tva' | 'ig_lieferung'
/** Satz der TVA in Luxemburg für unsere Dienstleistungen (Regelsatz). */
export const TVA_LUXEMBURG = 17

/** Aufbewahrungshinweis für Privatpersonen als Leistungsempfänger (Gerüste stehen an einem Grundstück). */
export function aufbewahrungsHinweis(inv: { customer_privat?: boolean | null; grundstuecksbezug?: boolean | null }): string | null {
  // Nur bei Privatpersonen und nur, wenn die Leistung an einem Grundstück erbracht wird (Standard bei Gerüsten)
  return inv.customer_privat && inv.grundstuecksbezug !== false ? HINWEIS_AUFBEWAHRUNG : null
}

/**
 * § 13b bei Bauleistungen: Der Leistungsempfänger muss selbst Bauleistungen erbringen und das nachweisen
 * (Bescheinigung USt 1 TG). Die Software prüft, was sie prüfen kann: Privatpersonen sind ausgeschlossen (Fehler);
 * fehlende oder abgelaufene Bescheinigung und fehlende USt-IdNr. des Kunden sind Warnungen. Die Entscheidung im Einzelfall trifft die Firma.
 */
export function pruefe13b(
  kunde: { kundentyp?: string | null; ust_id?: string | null; bauleister_nachweis_bis?: string | null } | null,
  heute: string,
): { fehler?: string; warnungen: string[] } {
  const warnungen: string[] = []
  if (!kunde) return { warnungen: ['Kunde ist nicht im Kundenstamm gefunden: Bescheinigung (USt 1 TG) und USt-IdNr. bitte vor dem Versand prüfen.'] }
  if (kunde.kundentyp === 'privat') return { fehler: '§ 13b UStG gilt nur, wenn der Kunde Unternehmer ist. Dieser Kunde ist als Privatperson geführt.', warnungen }
  if (!kunde.bauleister_nachweis_bis) warnungen.push('Beim Kunden ist keine Bescheinigung (USt 1 TG) hinterlegt. Bitte vor dem Versand klären.')
  else if (kunde.bauleister_nachweis_bis < heute) warnungen.push('Die hinterlegte Bescheinigung (USt 1 TG) des Kunden ist abgelaufen. Bitte neu anfordern.')
  if (!kunde.ust_id) warnungen.push('Beim Kunden ist keine USt-IdNr. hinterlegt.')
  return { warnungen }
}

/** Steuerfreie innergemeinschaftliche Lieferung: nur an Unternehmer mit USt-IdNr. eines anderen EU-Landes (z. B. TVA-Nr. Luxemburg). */
export function pruefeIgLieferung(kunde: { kundentyp?: string | null; ust_id?: string | null } | null): { fehler?: string; warnungen: string[] } {
  const warnungen: string[] = []
  const hilfe = 'Bitte beim Kunden im Kundenstamm eintragen (Kunden → USt-IdNr.).'
  if (!kunde) return { fehler: `Der Kunde ist nicht im Kundenstamm gefunden. Für eine steuerfreie innergemeinschaftliche Lieferung braucht die Rechnung die USt-IdNr./TVA-Nr. des Kunden. ${hilfe}`, warnungen }
  if (kunde.kundentyp === 'privat') return { fehler: 'Eine steuerfreie innergemeinschaftliche Lieferung gilt nur an Unternehmer. Dieser Kunde ist als Privatperson geführt.', warnungen }
  const u = (kunde.ust_id || '').replace(/\s+/g, '').toUpperCase()
  if (!u) return { fehler: `Für eine steuerfreie innergemeinschaftliche Lieferung ist die USt-IdNr./TVA-Nr. des Kunden Pflicht. ${hilfe}`, warnungen }
  if (u.startsWith('DE')) return { fehler: 'Eine innergemeinschaftliche Lieferung braucht die USt-IdNr. eines anderen EU-Landes (bei Luxemburg: LU und 8 Ziffern). Eine deutsche USt-IdNr. genügt nicht.', warnungen }
  if (u.startsWith('LU') && !/^LU\d{8}$/.test(u)) warnungen.push('Eine TVA-Nr. aus Luxemburg besteht aus LU und 8 Ziffern. Bitte beim Kunden prüfen.')
  return { warnungen }
}

/** Luxemburg mit 17 % TVA: Hinweise zur Kundennummer (die TVA-Nr. des Kunden wird auf die Rechnung gedruckt). */
export function pruefeLuTva(kunde: { kundentyp?: string | null; ust_id?: string | null } | null): string[] {
  const w: string[] = []
  if (!kunde) return ['Kunde ist nicht im Kundenstamm gefunden: die TVA-Nr. des Kunden fehlt auf der Rechnung.']
  const u = (kunde.ust_id || '').replace(/\s+/g, '').toUpperCase()
  if (!u && kunde.kundentyp !== 'privat') w.push('Beim Kunden ist keine TVA-Nr. hinterlegt; sie steht dann nicht auf der Rechnung.')
  if (u.startsWith('LU') && !/^LU\d{8}$/.test(u)) w.push('Eine TVA-Nr. aus Luxemburg besteht aus LU und 8 Ziffern. Bitte beim Kunden prüfen.')
  return w
}

/** Zeile mit der USt-IdNr./TVA-Nr. des Kunden für den Beleg (null, wenn keine hinterlegt ist). */
export function kundenUstIdZeile(inv: { customer_ust_id?: string | null }): string | null {
  const u = (inv.customer_ust_id || '').trim()
  return u ? `USt-IdNr. / TVA-Nr.: ${u}` : null
}

/** Zusätzliche Verkäuferangaben, die XRechnung (BR-DE-2) verlangt: Ansprechpartner, Telefon, E-Mail. */
export function pruefeXrechnungVerkaeufer(cs: { ansprechpartner?: string | null; phone?: string | null; email?: string | null } | null | undefined): PflichtLuecke[] {
  const c = cs || {}
  const l: PflichtLuecke[] = []
  if (!(c.ansprechpartner || '').trim()) l.push({ code: 'ANSPRECHPARTNER', text: 'Ansprechpartner des Ausstellers fehlt (Einstellungen → Firmenprofil).' })
  if (!(c.phone || '').trim()) l.push({ code: 'TELEFON', text: 'Telefonnummer des Ausstellers fehlt (Einstellungen → Firmenprofil).' })
  if (!(c.email || '').trim()) l.push({ code: 'EMAIL', text: 'E-Mail des Ausstellers fehlt (Einstellungen → Firmenprofil).' })
  return l
}

export interface SteuerFall { kategorie: SteuerKategorie; satz: number; grund?: string }

/** Steuerfall einer Rechnung: Satz > 0 = Regelsteuer; 0 % je nach Hinweis § 13b (Steuerschuldnerschaft) oder § 19 (Kleinunternehmer). */
export function steuerFall(inv: { tax_rate: unknown; notes?: string | null; steuerfall?: string | null }): SteuerFall {
  const rate = Number(inv.tax_rate)
  const satz = Number.isFinite(rate) ? rate : 19
  if (satz > 0) return { kategorie: 'S', satz }
  const n = inv.notes || ''
  // Die gewählte Steuerbehandlung hat Vorrang; ältere Rechnungen ohne Auswahl werden am Hinweistext erkannt
  if (inv.steuerfall === 'ig_lieferung' || (!inv.steuerfall && n.includes('§ 6a UStG'))) return { kategorie: 'K', satz: 0, grund: HINWEIS_IG.replace(/\.$/, '') }
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
  steuerfall?: string | null; customer_ust_id?: string | null
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
  if (f.kategorie === 'K' && !cs.ust_id) l.push({ code: 'USTID_IG', text: 'Bei einer innergemeinschaftlichen Lieferung ist die USt-IdNr. des Ausstellers anzugeben.' })
  if (f.kategorie === 'K' && !(inv.customer_ust_id || '').trim()) l.push({ code: 'USTID_KUNDE_IG', text: 'Bei einer innergemeinschaftlichen Lieferung ist die USt-IdNr./TVA-Nr. des Kunden anzugeben.' })
  if (inv.invoice_type === 'gutschrift' && !inv.reference_invoice_number) l.push({ code: 'GUTSCHRIFT_BEZUG', text: 'Gutschrift ohne Bezug auf die ursprüngliche Rechnung.' })
  return l
}
