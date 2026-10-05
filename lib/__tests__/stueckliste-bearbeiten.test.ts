import { describe, it, expect } from 'vitest'
import { uebernehmeMaterialBearbeitung, KostenErgebnis } from '../stueckliste-bearbeiten'

type Test = KostenErgebnis & { scaffoldClass?: string }

const pos = (q: number, p: number) => ({ quantity: q, unitPrice: p, totalPrice: q * p })

function basis(over: Partial<Test> = {}): Test {
  return { materialList: [pos(10, 10)], totalMaterialCost: 100, laborCost: 0, transportCost: 0, totalCost: 100, suggestedPrice: 100, margin: 0, marginPercent: 0, ...over }
}

describe('uebernehmeMaterialBearbeitung', () => {
  it('rechnet Fahrtkosten mit in die Kosten', () => {
    const r = uebernehmeMaterialBearbeitung(basis({ tripCost: 40, totalCost: 140, suggestedPrice: 140 }), [pos(10, 10)])
    expect(r.totalCost).toBe(140)
    expect(r.suggestedPrice).toBeCloseTo(140)
  })
  it('CAD-Angebot (Preis = Materialkosten): Preis folgt den Kosten, kein 25-%-Aufschlag', () => {
    const r = uebernehmeMaterialBearbeitung(basis(), [pos(30, 10)])
    expect(r.totalMaterialCost).toBe(300)
    expect(r.totalCost).toBe(300)
    expect(r.suggestedPrice).toBe(300)
    expect(r.margin).toBe(0)
    expect(r.marginPercent).toBe(0)
  })
  it('behält einen bestehenden Aufschlag bei', () => {
    const r = uebernehmeMaterialBearbeitung(basis({ totalCost: 100, suggestedPrice: 130 }), [pos(20, 10)])
    expect(r.suggestedPrice).toBeCloseTo(260)
    expect(r.marginPercent).toBe(30)
  })
  it('rechnet Arbeit und Transport mit in die Kosten', () => {
    const r = uebernehmeMaterialBearbeitung(basis({ laborCost: 50, transportCost: 50, totalCost: 200, suggestedPrice: 250 }), [pos(10, 10)])
    expect(r.totalCost).toBe(200)
    expect(r.suggestedPrice).toBeCloseTo(250)
  })
  it('ohne brauchbaren Ausgangswert gilt der bisherige Standard von 25 %', () => {
    const r = uebernehmeMaterialBearbeitung(basis({ totalCost: 0, suggestedPrice: 0 }), [pos(10, 10)])
    expect(r.suggestedPrice).toBeCloseTo(125)
    expect(r.marginPercent).toBe(25)
  })
  it('Menge 0 ergibt Kosten 0 ohne Fehler und lässt andere Felder unverändert', () => {
    const r = uebernehmeMaterialBearbeitung(basis({ scaffoldClass: 'CAD-Planung' }), [pos(0, 10)])
    expect(r.totalCost).toBe(0)
    expect(r.suggestedPrice).toBe(0)
    expect(r.scaffoldClass).toBe('CAD-Planung')
  })
})
