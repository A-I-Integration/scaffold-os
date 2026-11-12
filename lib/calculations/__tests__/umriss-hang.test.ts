import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
const lShape = (opt: Partial<BuildingParams['geruestOptionen']> = {}): BuildingParams => ({
  lengthM: 12, widthM: 10, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach',
  floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
  sides: ['front', 'back', 'left', 'right'],
  umriss: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 }],
  geruestOptionen: { feldlaengeM: 2.07, ...opt },
} as BuildingParams)
describe('Hang im Umriss-Modus', () => {
  it('ohne Eckhöhen: Fuß bei 0, Hinweis dass Hang ignoriert wird möglich', () => {
    const m = generateCADModel(lShape(), 'layher-allround')
    expect(Math.min(...m.fields.map((f) => f.positionY))).toBeCloseTo(0, 1)
  })
  it('mit Eckhöhen: Gerüst steht gleichmäßig tiefer (auf dem tiefsten Punkt)', () => {
    const m = generateCADModel(lShape({ gelaendeEckenM: { fl: -3, fr: 0, bl: -3, br: 0 } }), 'layher-allround')
    expect(Math.min(...m.fields.map((f) => f.positionY))).toBeLessThan(-2.5)
    expect(m.warnings.some((w) => w.code === 'UMRISS_HANG_GLEICH')).toBe(true)
  })
})
