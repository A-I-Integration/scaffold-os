import { describe, it, expect } from 'vitest'
import { erzeugeAngebotPdf } from '../angebot-pdf'
import { baueDirektAngebot } from '../ki-angebot-direkt'

const ki = {
  riskLevel: 'green', warnings: ['Hinweis A'], tips: [], totalAreaM2: 250, suggestedPrice: 42000, totalCost: 31500,
  materialList: [{ articleNumber: '1', name: 'Rahmen 2,00 m', quantity: 10, unit: 'Stk', unitPrice: 5, totalPrice: 50 }],
} as never

describe('erzeugeAngebotPdf', () => {
  it('erzeugt aus der Direkt-Berechnung ein PDF', () => {
    const d = baueDirektAngebot({ daten: {}, ergebnis: ki, kundenPreis: null, firmaFahrtSatz: null, kmGesamt: '' })
    const pdf = erzeugeAngebotPdf({ kiResult: ki, s1: { name: 'Müller GmbH', adresse: 'Ölbachstr. 48, 48691 Vreden' }, s2: {}, s3: {}, projektnummer: null, companyProfile: { company_name: 'Test', street: 'Weg 1', zip: '48691', city: 'Vreden' }, preisModus: d.preisModus, anpassungen: d.anpassungen, ang: d.ang, cadAnsicht: null })
    expect(pdf).toMatch(/^data:application\/pdf/)
    expect((pdf as string).length).toBeGreaterThan(5000)
  })
  it('ohne KI-Ergebnis: kein PDF', () => {
    expect(erzeugeAngebotPdf({ kiResult: null, s1: {}, s2: {}, s3: {}, projektnummer: null, companyProfile: null, preisModus: 'ki', anpassungen: {}, ang: {}, cadAnsicht: null })).toBeNull()
  })
})
