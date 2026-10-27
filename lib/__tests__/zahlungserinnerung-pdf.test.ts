import { describe, it, expect } from 'vitest'
import { generateZahlungserinnerungPDF, type Invoice } from '../invoice-pdf'

describe('Zahlungserinnerung-PDF', () => {
  it('erzeugt ein PDF ohne Gebühren und Zinsen', () => {
    const inv = { id: 'x', invoice_number: 'R-1', customer_name: 'Test GmbH', invoice_date: '2026-09-01', due_date: '2026-09-15', gross_amount: 1190, paid_amount: 190, company_snapshot: { company_name: 'Firma', iban: 'DE00' } } as unknown as Invoice
    const doc = generateZahlungserinnerungPDF(inv)
    const buf = Buffer.from(doc.output('arraybuffer'))
    expect(buf.subarray(0, 4).toString()).toBe('%PDF')
    const txt = doc.output()
    expect(doc.getNumberOfPages()).toBe(1)
    expect(txt.length).toBeGreaterThan(1000)
  })
})
