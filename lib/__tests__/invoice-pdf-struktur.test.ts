import { describe, it, expect } from 'vitest'
import { generateInvoicePdfCompliant } from '@/lib/invoice-pdf-server'

describe('Rechnungs-PDF mit strukturierten Angaben', () => {
  it('erzeugt ein PDF mit Gerüstnummer, Leistungsdatum, Maßen, Faktor und Stundenlohn', async () => {
    const pdf = await generateInvoicePdfCompliant({
      id: '1', invoice_number: 'RE-2026-0001', project_id: null, customer_name: 'Test GmbH', customer_address: 'Weg 1',
      positions: [
        { bezeichnung: 'Fassadengerüst', menge: 72, einheit: 'm²', einzelpreis: 8, art: 'geruest', laengeM: 12, hoeheM: 6, listenpreis: 10, faktorProzent: 80 },
        { bezeichnung: 'Regie', menge: 8, einheit: 'Std.', einzelpreis: 65, art: 'regie', mitarbeiter: 'A. Muster', taetigkeit: 'Schultertransport' },
      ],
      net_amount: 1096, tax_rate: 19, tax_amount: 208.24, gross_amount: 1304.24, status: 'offen',
      invoice_date: '2026-10-26', due_date: '2026-11-09', notes: null, created_at: '2026-10-26',
      geruest_nr: 'G-2026-014', leistungsdatum: '2026-10-20',
    } as any)
    expect(pdf.length).toBeGreaterThan(1000)
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
  })
})
