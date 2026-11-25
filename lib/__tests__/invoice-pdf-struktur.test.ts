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

  it('druckt Bemerkungen und weicht bei langem Text auf eine Folgeseite aus', async () => {
    const basis = {
      id: '1', invoice_number: 'RE-2026-0002', project_id: null, customer_name: 'Test GmbH', customer_address: 'Weg 1',
      positions: [{ bezeichnung: 'Fassadengerüst', menge: 10, einheit: 'm²', einzelpreis: 8 }],
      net_amount: 80, tax_rate: 19, tax_amount: 15.2, gross_amount: 95.2, status: 'offen',
      invoice_date: '2026-10-26', due_date: '2026-11-09', created_at: '2026-10-26',
    }
    const ohne = await generateInvoicePdfCompliant({ ...basis, notes: null } as any)
    const kurz = await generateInvoicePdfCompliant({ ...basis, notes: 'Schultertransport vereinbart.\nAlu-Podesttreppe unter 5 m 😀' } as any)
    const lang = await generateInvoicePdfCompliant({ ...basis, notes: Array.from({ length: 60 }, (_, i) => `Vereinbarung ${i + 1}`).join('\n') } as any)
    const { PDFDocument } = await import('pdf-lib')
    expect((await PDFDocument.load(ohne)).getPageCount()).toBe(1)
    expect((await PDFDocument.load(kurz)).getPageCount()).toBe(1)
    expect(kurz.length).toBeGreaterThan(ohne.length)
    expect((await PDFDocument.load(lang)).getPageCount()).toBeGreaterThan(1)
  })

  it('druckt die TVA-Nr. des Kunden und beschriftet Luxemburg (17 %) mit TVA', async () => {
    const { execFileSync, spawnSync } = await import('node:child_process')
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    if (spawnSync('pdftotext', ['-v']).error) return // ohne pdftotext lässt sich der Text nicht lesen
    const basis = {
      id: '1', invoice_number: 'RE-2026-0003', project_id: null, customer_name: 'Lux Bau S.A.', customer_address: 'Rue 1',
      positions: [{ bezeichnung: 'Material', menge: 10, einheit: 'Stk.', einzelpreis: 50 }],
      status: 'offen', invoice_date: '2026-11-25', due_date: '2026-12-09', created_at: '2026-11-25',
    }
    const text = async (inv: object) => {
      const f = join(mkdtempSync(join(tmpdir(), 'pdf-')), 'r.pdf')
      writeFileSync(f, await generateInvoicePdfCompliant(inv as any))
      return execFileSync('pdftotext', ['-layout', f, '-']).toString()
    }
    const lu = await text({ ...basis, net_amount: 500, tax_rate: 17, tax_amount: 85, gross_amount: 585, steuerfall: 'lu_tva', customer_ust_id: 'LU12345678', notes: null })
    expect(lu).toContain('17 % TVA (Luxemburg)')
    expect(lu).toContain('USt-IdNr. / TVA-Nr.: LU12345678')
    const ig = await text({ ...basis, net_amount: 500, tax_rate: 0, tax_amount: 0, gross_amount: 500, steuerfall: 'ig_lieferung', customer_ust_id: 'LU12345678', notes: 'Steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1 Buchst. b i. V. m. § 6a UStG).' })
    expect(ig).toContain('TVA-Nr.: LU12345678')
    expect(ig).toContain('§ 6a UStG')
    expect(await text({ ...basis, net_amount: 500, tax_rate: 19, tax_amount: 95, gross_amount: 595, notes: null })).not.toContain('TVA')
  })
})
