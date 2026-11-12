import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, type BuildingParams } from '@/lib/calculations/cad-engine'

const haus = (opt: object): BuildingParams => ({
  lengthM: 12, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach',
  floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
  sides: ['front'], geruestOptionen: { feldlaengeM: 2.07, ...opt },
} as BuildingParams)

describe('Hang: Ausgleichsstiel und Fußspindel in der Stückliste', () => {
  it('Felder am Hang tragen den Fußausgleich und stehen in der Stückliste (Preis aus dem Lager = 0)', () => {
    const m = generateCADModel(haus({ gelaendeLinieSeiteM: { front: { vonM: 0, bisM: -3.7 } } }), 'layher-allround')
    const mitFuss = m.fields.filter((f) => f.fuss)
    expect(mitFuss.length).toBeGreaterThan(0)
    const bom = generateBillOfMaterials(m)
    const spindeln = bom.filter((b) => /^FS-0(60|80)$/.test(b.articleNumber))
    expect(spindeln.length).toBeGreaterThan(0)
    expect(spindeln.reduce((a, b) => a + b.quantity, 0)).toBe(mitFuss.length * 4)
    expect(spindeln.every((b) => b.unitPrice === 0)).toBe(true)
    const stiele = bom.filter((b) => b.articleNumber.startsWith('AG-'))
    expect(stiele.every((b) => /Ausgleichsstiel \d,\d\d m/.test(b.name))).toBe(true)
  })
  it('ohne Hang kein Ausgleichsteil', () => {
    const m = generateCADModel(haus({}), 'layher-allround')
    expect(m.fields.some((f) => f.fuss)).toBe(false)
    expect(generateBillOfMaterials(m).some((b) => /^(AG|FS)-/.test(b.articleNumber))).toBe(false)
  })
})

describe('Hang: Pfosten bis zum Gelände gezeichnet', () => {
  it('jedes Fußfeld hat Pfosten, die bis zur Fußplatte reichen; reiner Spindelschaft zählt nicht in die Stückliste', () => {
    const m = generateCADModel(haus({ gelaendeLinieSeiteM: { front: { vonM: 0, bisM: -3.7 } } }), 'layher-allround')
    const pfosten = m.components3D.filter((c) => c.type === 'ausgleich')
    expect(pfosten.length).toBeGreaterThan(0)
    const bom = generateBillOfMaterials(m)
    const nurSchaft = m.components3D.filter((c) => c.id.startsWith('spindelschaft-'))
    nurSchaft.forEach((c) => expect(c.extern).toBe(true))
    const spindeln = bom.filter((b) => /^FS-0(60|80)$/.test(b.articleNumber)).reduce((a, b) => a + b.quantity, 0)
    expect(spindeln).toBe(m.fields.filter((f) => f.fuss).length * 4)
  })
})
