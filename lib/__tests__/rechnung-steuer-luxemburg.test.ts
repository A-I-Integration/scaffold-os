import { describe, it, expect } from 'vitest'
import { validateInput, Profile } from '@stackforge-eu/factur-x'
import { steuerFall, pruefeIgLieferung, pruefeLuTva, kundenUstIdZeile, pruefePflichtangaben } from '../rechnung-steuer'
import { notizMitSteuerHinweis, HINWEIS_IG } from '../ust-hinweis'
import { baueERechnungEingabe } from '../rechnung-erechnung'

describe('Luxemburg und innergemeinschaftliche Lieferung', () => {
  it('Steuerfall: 17 % = Regelsteuer; ig_lieferung = Kategorie K mit Grund', () => {
    expect(steuerFall({ tax_rate: 17, steuerfall: 'lu_tva' })).toMatchObject({ kategorie: 'S', satz: 17 })
    expect(steuerFall({ tax_rate: 0, steuerfall: 'ig_lieferung' })).toMatchObject({ kategorie: 'K', satz: 0 })
    expect(steuerFall({ tax_rate: 0, notes: HINWEIS_IG }).kategorie).toBe('K')
  })
  it('Hinweis wird einmal angefügt', () => {
    const n = notizMitSteuerHinweis('Danke', 0, 'ig_lieferung')!
    expect(n).toContain('§ 6a UStG'); expect(n).toContain('Danke')
    expect(notizMitSteuerHinweis(n, 0, 'ig_lieferung')).toBe(n)
  })
  it('Prüfung IG: TVA-Nr. Pflicht, nicht deutsch, nicht Privatperson', () => {
    expect(pruefeIgLieferung(null).fehler).toBeTruthy()
    expect(pruefeIgLieferung({ kundentyp: 'privat', ust_id: 'LU12345678' }).fehler).toContain('Unternehmer')
    expect(pruefeIgLieferung({ kundentyp: 'gewerblich', ust_id: null }).fehler).toContain('Pflicht')
    expect(pruefeIgLieferung({ kundentyp: 'gewerblich', ust_id: 'DE123456789' }).fehler).toContain('anderen EU-Landes')
    expect(pruefeIgLieferung({ kundentyp: 'gewerblich', ust_id: 'LU12345678' })).toEqual({ warnungen: [] })
    expect(pruefeIgLieferung({ kundentyp: 'gewerblich', ust_id: 'LU1234' }).warnungen).toHaveLength(1)
  })
  it('Prüfung Luxemburg 17 %: Hinweis ohne TVA-Nr.', () => {
    expect(pruefeLuTva({ kundentyp: 'gewerblich', ust_id: null })).toHaveLength(1)
    expect(pruefeLuTva({ kundentyp: 'gewerblich', ust_id: 'LU12345678' })).toEqual([])
  })
  it('Beleg-Zeile mit der TVA-Nr. des Kunden', () => {
    expect(kundenUstIdZeile({ customer_ust_id: 'LU12345678' })).toBe('USt-IdNr. / TVA-Nr.: LU12345678')
    expect(kundenUstIdZeile({ customer_ust_id: null })).toBeNull()
  })
  it('Pflichtangaben: IG braucht beide USt-IdNr.', () => {
    const basis = { invoice_number: 'R1', invoice_date: '2026-11-25', customer_name: 'X', customer_address: 'a\n1 b', positions: [{ bezeichnung: 'Teil', menge: 1 }], tax_rate: 0, notes: HINWEIS_IG, steuerfall: 'ig_lieferung', gross_amount: 500, company_snapshot: { company_name: 'F', street: 's', zip: '1', city: 'c', ust_id: 'DE123456789' } }
    expect(pruefePflichtangaben(basis).map(l => l.code)).toEqual(['USTID_KUNDE_IG'])
    expect(pruefePflichtangaben({ ...basis, customer_ust_id: 'LU12345678' })).toEqual([])
  })
  it('E-Rechnung: IG = Kategorie K mit Befreiungsgrund und -code; 17 % = S', () => {
    const cs = { company_name: 'Test GmbH', street: 'Weg 1', zip: '48691', city: 'Vreden', ust_id: 'DE123456789', iban: 'DE02120300000000202051' }
    const basis = { invoice_number: 'RE-2026-0002', invoice_date: '2026-11-25', due_date: '2026-12-09', customer_name: 'Lux Bau S.A.', customer_address: 'Rue 1\n1234 Luxembourg', customer_ust_id: 'LU12345678', positions: [{ bezeichnung: 'Material', menge: 10, einheit: 'Stk.', einzelpreis: 50 }], company_snapshot: cs }
    const ig = baueERechnungEingabe({ ...basis, net_amount: 500, tax_rate: 0, tax_amount: 0, gross_amount: 500, steuerfall: 'ig_lieferung', notes: HINWEIS_IG })
    expect(ig.vatBreakdown[0]).toMatchObject({ categoryCode: 'K', ratePercent: 0, exemptionReasonCode: 'VATEX-EU-IC' })
    const lu = baueERechnungEingabe({ ...basis, net_amount: 500, tax_rate: 17, tax_amount: 85, gross_amount: 585, steuerfall: 'lu_tva' })
    expect(lu.vatBreakdown[0]).toMatchObject({ categoryCode: 'S', ratePercent: 17 })
    expect(validateInput(lu, Profile.EN16931).valid).toBe(true)
  })
})
