import { describe, it, expect } from 'vitest'
import { berechneForderung } from '../forderung'

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
    const f = berechneForderung([R({ invoice_number: 'RE1', gross_amount: 1190, status: 'storniert' }), R({ invoice_number: 'RE2', gross_amount: 500 }), G('GS1', 'RE1', 1190)], { unbezogeneVerrechnen: true })
    expect(f.offen).toBe(500)
  })
  it('Überhang auf bezahlter Rechnung ist Guthaben und mindert andere Rechnungen nicht', () => {
    const f = berechneForderung([R({ invoice_number: 'RE1', gross_amount: 1190, status: 'bezahlt' }), R({ invoice_number: 'RE2', gross_amount: 595 }), G('GS1', 'RE1', 595)])
    expect(f.offen).toBe(595); expect(f.guthaben).toBe(595)
  })
  it('Gutschrift ohne Bezug: nur bei Einzelbaustelle verrechnet, nie über den offenen Betrag', () => {
    const l = [R({ invoice_number: 'RE1', gross_amount: 1000 }), G('GS1', null, 400)]
    expect(berechneForderung(l).offen).toBe(1000)
    expect(berechneForderung(l, { unbezogeneVerrechnen: true }).offen).toBe(600)
    expect(berechneForderung([R({ invoice_number: 'RE1', gross_amount: 100 }), G('GS1', null, 400)], { unbezogeneVerrechnen: true }).offen).toBe(0)
  })
  it('überfällig nur vom noch offenen Betrag', () => {
    const f = berechneForderung([R({ invoice_number: 'RE1', gross_amount: 1000, due_date: '2020-01-01' }), G('GS1', 'RE1', 300)], { heute: '2026-01-01' })
    expect(f.ueberfaellig).toBe(700)
  })
})
