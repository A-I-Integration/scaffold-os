import { describe, it, expect } from 'vitest'
import { validateInput, Profile } from '@stackforge-eu/factur-x'
import { baueERechnungEingabe } from '../rechnung-erechnung'
import { HINWEIS_13B } from '../ust-hinweis'

const cs = { company_name: 'Test GmbH', street: 'Weg 1', zip: '48691', city: 'Vreden', ust_id: 'DE123456789', iban: 'DE02120300000000202051' }
const inv = (extra: Record<string, unknown> = {}) => ({
  invoice_number: 'RE-2026-0001', invoice_date: '2026-11-19', due_date: '2026-12-03', customer_name: 'Gerüstbau Müller GmbH', customer_address: 'Baustellenstraße 25\n48143 Münster',
  positions: [{ bezeichnung: 'Fassadengerüst', menge: 200, einheit: 'm²', einzelpreis: 4.5 }, { bezeichnung: 'Auf- und Abbau', menge: 1, einheit: 'Pauschale', einzelpreis: 350 }],
  net_amount: 1250, tax_rate: 19, tax_amount: 237.5, gross_amount: 1487.5, company_snapshot: cs, ...extra,
})

describe('E-Rechnung aus Rechnungsdaten', () => {
  it('19 %: gültig nach EN 16931, Einheiten und Käuferadresse übernommen', () => {
    const e = baueERechnungEingabe(inv())
    expect(validateInput(e, Profile.EN16931).valid).toBe(true)
    expect(e.lines.map((l: any) => l.unitCode)).toEqual(['MTK', 'LS'])
    expect(e.buyer.address).toMatchObject({ postalCode: '48143', city: 'Münster' })
    expect(e.vatBreakdown[0]).toMatchObject({ categoryCode: 'S', ratePercent: 19 })
  })
  it('§ 13b: 0 % bleibt 0 %, Kategorie AE mit Grund', () => {
    const e = baueERechnungEingabe(inv({ tax_rate: 0, tax_amount: 0, gross_amount: 1250, notes: HINWEIS_13B }))
    expect(e.vatBreakdown[0]).toMatchObject({ categoryCode: 'AE', ratePercent: 0 })
    expect(e.vatBreakdown[0].exemptionReason).toContain('§ 13b')
    expect(validateInput(e, Profile.EN16931).valid).toBe(true)
  })
  it('Gutschrift: Gutschrifts-Typ und positive Beträge', () => {
    const e = baueERechnungEingabe(inv({ invoice_type: 'gutschrift', net_amount: -1250, tax_amount: -237.5, gross_amount: -1487.5 }))
    expect(e.document.typeCode).toBe('381')
    expect(e.totals.grandTotal).toBe(1487.5)
  })
  it('ohne eigenes Leistungsdatum gilt das Rechnungsdatum', () => {
    expect(baueERechnungEingabe(inv()).delivery.date).toBe('2026-11-19')
  })
})
