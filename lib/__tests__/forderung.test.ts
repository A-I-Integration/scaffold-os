import { describe, it, expect } from 'vitest'
import { berechneForderung, forderungsStatus, statusJe, mitBezugsGutschriften } from '../forderung'

const R = (o: Record<string, unknown>) => ({ id: String(o.invoice_number), status: 'offen', gross_amount: 0, paid_amount: 0, invoice_type: 'standard', ...o }) as any
const G = (nr: string, bezug: string | null, brutto: number, status = 'offen') => R({ invoice_number: nr, invoice_type: 'gutschrift', gross_amount: -brutto, reference_invoice_number: bezug, status })

describe('berechneForderung (offener Betrag mit Gutschriften)', () => {
  it('Beispiel: 3.570 − 1.190 Gutschrift, nichts bezahlt = 2.380', () => {
    expect(berechneForderung([R({ invoice_number: 'RE1', gross_amount: 3570 }), G('GS1', 'RE1', 1190)]).offen).toBe(2380)
  })
  it('Teilzahlung und mehrere Gutschriften', () => {
    const f = berechneForderung([R({ invoice_number: 'RE1', gross_amount: 3570, paid_amount: 500 }), G('GS1', 'RE1', 1190), G('GS2', 'RE1', 595)])
    expect(f.offen).toBe(1285); expect(f.bezahlt).toBe(500); expect(f.gutschriftAbzug).toBe(1785)
  })
  it('stornierte Gutschrift wird nicht abgezogen', () => {
    expect(berechneForderung([R({ invoice_number: 'RE1', gross_amount: 1190 }), G('GS1', 'RE1', 595, 'storniert')]).offen).toBe(1190)
  })
  it('Gutschrift zu stornierter Rechnung wird nicht doppelt verrechnet', () => {
    const f = berechneForderung([R({ invoice_number: 'RE1', gross_amount: 1190, status: 'storniert' }), R({ invoice_number: 'RE2', gross_amount: 500 }), G('GS1', 'RE1', 1190)])
    expect(f.offen).toBe(500)
  })
  it('Überhang auf bezahlter Rechnung ist Guthaben und mindert andere Rechnungen nicht', () => {
    const f = berechneForderung([R({ invoice_number: 'RE1', gross_amount: 1190, status: 'bezahlt' }), R({ invoice_number: 'RE2', gross_amount: 595 }), G('GS1', 'RE1', 595)])
    expect(f.offen).toBe(595); expect(f.guthaben).toBe(595)
  })
  it('Gutschrift ohne Bezug wird nie zugeschlagen, sondern als ungeklärt ausgewiesen', () => {
    const f = berechneForderung([R({ invoice_number: 'RE1', gross_amount: 1000 }), G('GS1', null, 400), G('GS2', 'GIBTESNICHT', 100)])
    expect(f.offen).toBe(1000); expect(f.ungeklaert).toBe(500); expect(f.gutschriftAbzug).toBe(0)
  })
  it('überfällig nur vom noch offenen Betrag', () => {
    const f = berechneForderung([R({ invoice_number: 'RE1', gross_amount: 1000, due_date: '2020-01-01' }), G('GS1', 'RE1', 300)], { heute: '2026-01-01' })
    expect(f.ueberfaellig).toBe(700)
    expect(berechneForderung([R({ invoice_number: 'RE2', gross_amount: 100, status: 'ueberfaellig' })], { heute: '2026-01-01' }).ueberfaellig).toBe(100)
  })
  it('Überzahlung wird Guthaben, nicht negative Forderung', () => {
    const f = berechneForderung([R({ invoice_number: 'RE1', gross_amount: 1000, paid_amount: 1300 })])
    expect(f.offen).toBe(0); expect(f.guthaben).toBe(300); expect(f.bezahlt).toBe(1000)
  })
  it('mehrere Baustellen und mehrere Kunden: Summe über alle = Summe der Einzelberechnungen (Bezug eindeutig über Rechnungsnummer)', () => {
    const k1b1 = [R({ invoice_number: 'A1', gross_amount: 1000 }), G('GA1', 'A1', 200)]
    const k1b2 = [R({ invoice_number: 'A2', gross_amount: 500, paid_amount: 100 })]
    const k2 = [R({ invoice_number: 'B1', gross_amount: 700 }), G('GB1', 'B1', 700)]
    const einzeln = [k1b1, k1b2, k2].map((l) => berechneForderung(l).offen)
    expect(einzeln).toEqual([800, 400, 0])
    expect(berechneForderung([...k1b1, ...k1b2, ...k2]).offen).toBe(1200)
    // Kundenebene (b1 + b2) = Summe der Baustellen
    expect(berechneForderung([...k1b1, ...k1b2]).offen).toBe(einzeln[0] + einzeln[1])
  })
  it('Gutschrift eines anderen Kunden/einer anderen Baustelle ohne passende Rechnung in der Liste verändert nichts', () => {
    const f = berechneForderung([R({ invoice_number: 'A1', gross_amount: 1000 }), G('GX', 'FREMD-1', 300)])
    expect(f.offen).toBe(1000); expect(f.ungeklaert).toBe(300)
  })
  it('Teilzahlung + Teilgutschrift gemeinsam, je Rechnung getrennt', () => {
    const f = berechneForderung([R({ invoice_number: 'RE1', id: 'i1', gross_amount: 1000, paid_amount: 300 }), R({ invoice_number: 'RE2', id: 'i2', gross_amount: 500 }), G('GS1', 'RE1', 200)])
    expect(f.je.get('i1')).toBe(500); expect(f.je.get('i2')).toBe(500); expect(f.offen).toBe(1000)
  })
})

// ── Rechnungsstatus aus Zahlungen und Gutschriften (12 Fälle) ──
describe('Rechnungsstatus aus der zentralen Forderung', () => {
  const st = (liste: any[], id = 'RE1') => statusJe(liste, '2026-06-01').get(id)
  const re = (o: Record<string, unknown> = {}) => R({ invoice_number: 'RE1', gross_amount: 3570, ...o })
  it('1 vollständig durch Zahlung → bezahlt', () => expect(st([re({ paid_amount: 3570, status: 'bezahlt' })])).toBe('bezahlt'))
  it('2 durch Gutschrift und Zahlung → ausgeglichen (Gutschrift ist keine Zahlung)', () => {
    const l = [re({ paid_amount: 2380, status: 'bezahlt' }), G('GS1', 'RE1', 1190)]
    expect(st(l)).toBe('ausgeglichen'); const f = berechneForderung(l); expect(f.bezahlt).toBe(2380); expect(f.offen).toBe(0); expect(f.guthaben).toBe(0)
  })
  it('3 vollständig nur durch Gutschrift → ausgeglichen, nicht bezahlt; gebuchte Zahlung bleibt 0', () => {
    const l = [re({ gross_amount: 1190 }), G('GS1', 'RE1', 1190)]
    expect(st(l)).toBe('ausgeglichen'); expect(berechneForderung(l).bezahlt).toBe(0)
  })
  it('4 teilweise durch Gutschrift → teilweise gutgeschrieben (nicht teilbezahlt)', () => expect(st([re(), G('GS1', 'RE1', 1190)])).toBe('teilausgeglichen'))
  it('4b Zahlung vorhanden → teilbezahlt', () => expect(st([re({ paid_amount: 500 }), G('GS1', 'RE1', 1190)])).toBe('teilbezahlt'))
  it('5 mehrere Gutschriften summieren sich → ausgeglichen', () => expect(st([re({ gross_amount: 1190 }), G('GS1', 'RE1', 595), G('GS2', 'RE1', 595)])).toBe('ausgeglichen'))
  it('6 Gutschrift ohne Baustellenzuordnung: wird über die Bezugsnummer ergänzt, nicht über die Liste', () => {
    const baustelle = [re({ gross_amount: 1190, id: 'i1', project_id: 'P1' })]
    const alle = [...baustelle, { ...G('GS1', 'RE1', 595), id: 'g1', project_id: null }, { ...G('GSX', 'FREMD', 100), id: 'g2' }]
    expect(berechneForderung(baustelle).offen).toBe(1190)                                  // ohne Ergänzung: zu hoch
    const mit = mitBezugsGutschriften(baustelle, alle)
    expect(mit.map((x: any) => x.id)).toEqual(['i1', 'g1']); expect(berechneForderung(mit).offen).toBe(595)   // fremde Gutschrift nicht dabei
  })
  it('7 Gutschrift ohne Rechnungsreferenz bleibt ungeklärt und verändert den Status nicht', () => {
    const l = [re(), G('GS1', null, 1190)]
    expect(st(l)).toBe('offen'); expect(berechneForderung(l).ungeklaert).toBe(1190)
  })
  it('8 stornierte Rechnung ist nie bezahlt', () => expect(st([re({ status: 'storniert', paid_amount: 3570 })])).toBe('storniert'))
  it('9 stornierte Gutschrift wirkt nicht', () => expect(st([re(), G('GS1', 'RE1', 1190, 'storniert')])).toBe('offen'))
  it('10 Überzahlung → bezahlt mit Guthaben', () => {
    const l = [re({ gross_amount: 1000, paid_amount: 1300 })]
    expect(st(l)).toBe('bezahlt'); expect(berechneForderung(l).guthaben).toBe(300)
  })
  it('11 Gutschrift auf bereits bezahlte Rechnung → bleibt bezahlt, Guthaben statt Verrechnung', () => {
    const l = [re({ gross_amount: 1190, paid_amount: 1190, status: 'bezahlt' }), G('GS1', 'RE1', 595)]
    expect(st(l)).toBe('bezahlt'); expect(berechneForderung(l).guthaben).toBe(595)
  })
  it('überfällig nur, solange etwas offen ist', () => {
    expect(forderungsStatus(re({ due_date: '2026-01-01' }) as any, 3570, 0, '2026-06-01')).toBe('ueberfaellig')
    expect(st([re({ due_date: '2026-01-01', gross_amount: 1190 }), G('GS1', 'RE1', 1190)])).toBe('ausgeglichen')
  })
  it('„bezahlt“ mit echter Zahlung zählt die Zahlung, nicht den Rechnungsbetrag (Gutschrift ist keine Zahlung)', () => {
    expect(berechneForderung([re({ status: 'bezahlt', paid_amount: 2380 })]).bezahlt).toBe(2380)
    expect(berechneForderung([re({ status: 'bezahlt', paid_amount: 0 })]).bezahlt).toBe(3570)   // ältere Daten ohne gebuchte Zahlung
  })
})
