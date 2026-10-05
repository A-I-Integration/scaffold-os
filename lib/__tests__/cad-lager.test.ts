import { describe, it, expect } from 'vitest'
import { wendeLagerAn } from '../calculations/cad-lager'
import { generateCADModel, addManualPlacement, generateBillOfMaterials, LEITER_ARTIKELNUMMER } from '../calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'

const pos = (o: Partial<MaterialItem>): MaterialItem => ({
  articleNumber: 'RA-001', name: 'Rahmen', category: 'Rahmen', quantity: 10, unit: 'Stk',
  unitPrice: 45, totalPrice: 450, weightKg: 12.5, riskLevel: 'low', aiRecommendation: '', ...o,
})

describe('wendeLagerAn', () => {
  it('nimmt Preis, Gewicht und Name aus dem Lager (SKU-Abgleich) und rechnet die Summe neu', () => {
    const r = wendeLagerAn([pos({})], [{ sku: 'RA-001', name: 'Rahmen Hersteller X', unit_price: 60, weight_kg: 14 }])
    expect(r.materials[0]).toMatchObject({ name: 'Rahmen Hersteller X', unitPrice: 60, weightKg: 14, totalPrice: 600 })
    expect(r.ausLager).toBe(1)
  })
  it('akzeptiert Zahlen als Text aus der Datenbank, auch mit Komma', () => {
    const r = wendeLagerAn([pos({})], [{ sku: 'RA-001', unit_price: '61,5', weight_kg: '13.2' }])
    expect(r.materials[0].unitPrice).toBe(61.5)
    expect(r.materials[0].weightKg).toBe(13.2)
  })
  it('Preis 0/leer im Lager → bisheriger CAD-Wert bleibt (wie im normalen Aufmaß)', () => {
    const r = wendeLagerAn([pos({})], [{ sku: 'RA-001', unit_price: 0, weight_kg: null }])
    expect(r.materials[0]).toMatchObject({ unitPrice: 45, weightKg: 12.5, totalPrice: 450 })
  })
  it('Artikel ohne Lager-Treffer bleibt unverändert; inaktive Lager-Artikel zählen nicht', () => {
    const r = wendeLagerAn([pos({})], [{ sku: 'XX-9', unit_price: 1 }, { sku: 'RA-001', unit_price: 99, is_active: false }])
    expect(r.materials[0].unitPrice).toBe(45)
    expect(r.ausLager).toBe(0)
  })
  it('ohne Lager (null/leer) bleibt alles wie vorher', () => {
    expect(wendeLagerAn([pos({})], null).materials[0].unitPrice).toBe(45)
    expect(wendeLagerAn([pos({})], []).materials[0].unitPrice).toBe(45)
  })
  it('meldet Positionen ohne Preis bzw. Gewicht', () => {
    const r = wendeLagerAn([pos({ articleNumber: 'LE-001', unitPrice: 0, totalPrice: 0, weightKg: 0 })], [])
    expect(r.ohnePreis).toEqual(['LE-001'])
    expect(r.ohneGewicht).toEqual(['LE-001'])
  })
  it('Leiter: Lager-Eintrag LE-001 liefert Preis, Gewicht und Name', () => {
    const r = wendeLagerAn([pos({ articleNumber: 'LE-001', name: 'Leiter (schematisch)', unitPrice: 0, totalPrice: 0, weightKg: 0, quantity: 2 })],
      [{ sku: 'LE-001', name: 'Alu-Leiter 3 m', unit_price: 120, weight_kg: 9 }])
    expect(r.materials[0]).toMatchObject({ name: 'Alu-Leiter 3 m', unitPrice: 120, weightKg: 9, totalPrice: 240 })
    expect(r.ohnePreis).toEqual([])
  })
})

describe('Leiter im CAD-Modell', () => {
  const basis = () => generateCADModel({ lengthM: 18, widthM: 14, heightM: 8, eavesHeightM: 8, roofForm: 'flachdach', overhangM: 0.5 } as any, 'layher-allround')

  it('ist ein einzelnes Bauteil LE-001 in der Kategorie Leitern, ohne erfundenen Preis', () => {
    const m = basis()
    addManualPlacement(m, { id: 'manual-ladder-1', type: 'ladder', positionX: 1, positionY: 1, positionZ: 7, side: 'front', levelIndex: 0 })
    const leiter = m.components3D.filter((c) => c.articleNumber === LEITER_ARTIKELNUMMER)
    expect(leiter).toHaveLength(1)
    expect(leiter[0].type).toBe('ladder')
    const bom = generateBillOfMaterials(m).find((x) => x.articleNumber === LEITER_ARTIKELNUMMER)!
    expect(bom).toMatchObject({ category: 'Leitern', quantity: 1, unitPrice: 0, weightKg: 0, totalPrice: 0 })
  })
  it('zwei Leitern ergeben Menge 2', () => {
    const m = basis()
    addManualPlacement(m, { id: 'manual-ladder-1', type: 'ladder', positionX: 1, positionY: 1, positionZ: 7, side: 'front', levelIndex: 0 })
    addManualPlacement(m, { id: 'manual-ladder-2', type: 'ladder', positionX: 4, positionY: 1, positionZ: 7, side: 'front', levelIndex: 0 })
    expect(generateBillOfMaterials(m).find((x) => x.articleNumber === LEITER_ARTIKELNUMMER)!.quantity).toBe(2)
  })
  it('Leiter an der Seitenfläche wird um 90° gedreht', () => {
    const m = basis()
    addManualPlacement(m, { id: 'manual-ladder-3', type: 'ladder', positionX: 9, positionY: 1, positionZ: 3, side: 'right', levelIndex: 0 })
    expect(m.components3D.find((c) => c.id === 'manual-ladder-3')!.rotation[1]).toBeCloseTo(Math.PI / 2)
  })
})
