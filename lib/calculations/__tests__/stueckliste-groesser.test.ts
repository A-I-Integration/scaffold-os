import { describe, it, expect } from 'vitest'
import { groessereStueckliste } from '../stuecklisten-abgleich'
import { generateBillOfMaterials, type CADModel } from '../cad-engine'
import type { MaterialItem } from '@/types/scaffold'

const m = (n: string, q: number, p = 10, name = n): MaterialItem => ({ articleNumber: n, name, category: 'x', quantity: q, unit: 'Stk', unitPrice: p, totalPrice: q * p, weightKg: 1, riskLevel: 'low', aiRecommendation: '' } as MaterialItem)

describe('groessereStueckliste', () => {
  it('nimmt je Artikel die größere Menge', () => {
    const r = groessereStueckliste([m('A', 5), m('B', 2)], [m('A', 3), m('B', 4)])
    expect(r.find((i) => i.articleNumber === 'A')!.quantity).toBe(5)
    expect(r.find((i) => i.articleNumber === 'B')!.quantity).toBe(4)
  })
  it('übernimmt Artikel, die nur eine Seite kennt, und bildet Summe neu', () => {
    const r = groessereStueckliste([m('A', 1)], [m('C', 3, 7)])
    expect(r.map((i) => i.articleNumber)).toEqual(['A', 'C'])
    expect(r[1].totalPrice).toBe(21)
  })
  it('Gleichstand: Aufmaß-Angaben', () => {
    const r = groessereStueckliste([m('A', 2, 10, 'Auf')], [m('A', 2, 99, 'Cad')])
    expect(r[0].name).toBe('Auf'); expect(r[0].unitPrice).toBe(10)
  })
})

describe('Treppe je Treppenlauf', () => {
  const comp = (id: string, flights?: number) => ({ id, type: 'stair', articleNumber: 'SP-001', name: 'T', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#000', ...(flights ? { flights } : {}) })
  it('zählt Läufe statt Bauteile', () => {
    const model = { components3D: [comp('a', 4), comp('b')] } as unknown as CADModel
    const sp = generateBillOfMaterials(model).find((i) => i.articleNumber === 'SP-001')!
    expect(sp.quantity).toBe(5)
  })
})

describe('Längen je Zeile (Querriegel, Bordbrett)', () => {
  it('schlüsselt die Längen auf, Artikelnummer und Menge bleiben', () => {
    const c = (id: string, art: string, l: number) => ({ id, type: art === 'QR-001' ? 'frame' : 'board', articleNumber: art, name: 'x', position: [0, 0, 0], rotation: [0, 0, 0], scale: [l, 0.04, 0.04], color: '#000' })
    const model = { components3D: [c('a', 'QR-001', 3.07), c('b', 'QR-001', 3.07), c('c', 'QR-001', 2.57), c('d', 'BB-001', 2.07)] } as unknown as CADModel
    const b = generateBillOfMaterials(model)
    const qr = b.find((i) => i.articleNumber === 'QR-001')!
    expect(qr.quantity).toBe(3); expect(qr.name).toBe('Querriegel'); expect(qr.aiRecommendation).toBe('Längen: 2× 3,07 m, 1× 2,57 m')
    expect(b.find((i) => i.articleNumber === 'BB-001')!.aiRecommendation).toBe('Längen: 1× 2,07 m')
  })
})
