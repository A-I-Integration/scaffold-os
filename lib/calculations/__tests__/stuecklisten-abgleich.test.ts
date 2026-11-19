import { describe, it, expect } from 'vitest'
import { vergleicheStuecklisten } from '../stuecklisten-abgleich'
import type { MaterialItem } from '@/types/scaffold'

const item = (articleNumber: string, quantity: number, unitPrice = 10): MaterialItem => ({ articleNumber, name: articleNumber, category: 'x', quantity, unit: 'Stk', unitPrice, totalPrice: quantity * unitPrice, weightKg: 1, riskLevel: 'low', aiRecommendation: '' })

describe('vergleicheStuecklisten', () => {
  it('gleiche Listen: keine Abweichung', () => {
    const r = vergleicheStuecklisten([item('A', 3), item('B', 2)], [item('B', 2), item('A', 3)])
    expect(r.abweichend).toEqual([])
    expect(r.summeAufmassEuro).toBe(r.summeCadEuro)
  })
  it('Mengenabweichung, nur-Aufmaß und nur-CAD-Artikel mit Eurobetrag', () => {
    const r = vergleicheStuecklisten([item('A', 3, 10), item('B', 1, 5)], [item('A', 5, 10), item('C', 2, 7)])
    const z = Object.fromEntries(r.zeilen.map((x) => [x.articleNumber, x]))
    expect(z.A).toMatchObject({ aufmass: 3, cad: 5, differenz: 2, differenzEuro: 20 })
    expect(z.B).toMatchObject({ aufmass: 1, cad: 0, differenz: -1, differenzEuro: -5 })
    expect(z.C).toMatchObject({ aufmass: 0, cad: 2, differenz: 2, differenzEuro: 14 })
    expect(r.abweichend).toHaveLength(3)
  })
  it('mehrere Zeilen derselben Nummer werden addiert', () => {
    const r = vergleicheStuecklisten([item('A', 1), item('A', 2)], [item('A', 3)])
    expect(r.abweichend).toEqual([])
  })
})
