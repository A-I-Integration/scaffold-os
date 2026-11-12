import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
const haus = (p: Partial<BuildingParams> = {}): BuildingParams => ({
  lengthM: 12, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach',
  floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
  sides: ['front'], ...p,
})
const lagenBei = (m: ReturnType<typeof generateCADModel>, side: string, x: number) =>
  m.fields.filter((f) => f.side === side && Math.abs(f.positionX - x) < 1.2).length

describe('Schräger Hang: Fuß treppt je Feld ab', () => {
  it('Feld am tiefen Ende hat mehr Lagen als am hohen Ende', () => {
    const m = generateCADModel(haus({ geruestOptionen: { feldlaengeM: 2.07, gelaendeLinieSeiteM: { front: { vonM: 0, bisM: -4 } } } }), 'layher-allround')
    const front = m.fields.filter((f) => f.side === 'front')
    const xMin = Math.min(...front.map((f) => f.positionX)), xMax = Math.max(...front.map((f) => f.positionX))
    // vonM=0 am Seitenanfang (kleinstes x), bisM=-4 am Ende (größtes x): tief = großes x
    const hoch = front.filter((f) => f.positionX < xMin + 1).length
    const tief = front.filter((f) => f.positionX > xMax - 1).length
    expect(tief).toBeGreaterThan(hoch)
  })
  it('kein Belag unter der Geländelinie (tiefstes Feld reicht bis ~ -4 m, hohes bleibt bei 0)', () => {
    const m = generateCADModel(haus({ geruestOptionen: { feldlaengeM: 2.07, gelaendeLinieSeiteM: { front: { vonM: 0, bisM: -4 } } } }), 'layher-allround')
    const front = m.fields.filter((f) => f.side === 'front')
    const xMax = Math.max(...front.map((f) => f.positionX))
    const tiefFuss = Math.min(...front.filter((f) => f.positionX > xMax - 1).map((f) => f.positionY))
    const hochFuss = Math.min(...front.filter((f) => f.positionX < Math.min(...front.map((q) => q.positionX)) + 1).map((f) => f.positionY))
    expect(tiefFuss).toBeLessThanOrEqual(-2)
    expect(hochFuss).toBeGreaterThanOrEqual(-0.01)
  })
  it('meldet die Abtreppung mit Ausgleichsteilen', () => {
    const m = generateCADModel(haus({ geruestOptionen: { feldlaengeM: 2.07, gelaendeLinieSeiteM: { front: { vonM: 0, bisM: -3 } } } }), 'layher-allround')
    expect(m.warnings.some((w) => w.code === 'HANG_ABTREPPUNG')).toBe(true)
  })
  it('ohne Geländelinie unverändert (keine Abtreppung)', () => {
    const m = generateCADModel(haus({ geruestOptionen: { feldlaengeM: 2.07 } }), 'layher-allround')
    expect(m.warnings.some((w) => w.code === 'HANG_ABTREPPUNG')).toBe(false)
  })
})

describe('Vier Eckhöhen (gelaendeEckenM): Gerüst folgt an allen Seiten', () => {
  const haus2 = (ec: { fl: number; fr: number; bl: number; br: number }): BuildingParams => ({
    lengthM: 12, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach',
    floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
    sides: ['front', 'back', 'left', 'right'], geruestOptionen: { feldlaengeM: 2.07, gelaendeEckenM: ec },
  } as BuildingParams)
  it('Hang quer (vorne tief, hinten hoch): Seiten links/rechts treppen ab', () => {
    const m = generateCADModel(haus2({ fl: -2.95, fr: -2.95, bl: 0, br: 0 }), 'layher-allround')
    const links = m.fields.filter((f) => f.side === 'left')
    const vorn = links.filter((f) => f.positionZ > Math.max(...links.map((q) => q.positionZ)) - 1)
    const hinten = links.filter((f) => f.positionZ < Math.min(...links.map((q) => q.positionZ)) + 1)
    const tiefe = (a: typeof links) => Math.min(...a.map((f) => f.positionY))
    expect(tiefe(vorn)).toBeLessThan(tiefe(hinten)) // vorne (tief) reicht weiter runter
    expect(m.warnings.some((w) => w.code === 'HANG_ABTREPPUNG')).toBe(true)
  })
  it('alle Ecken gleich tief: gleichmäßig tiefer, kein Abtreppen', () => {
    const m = generateCADModel(haus2({ fl: -2, fr: -2, bl: -2, br: -2 }), 'layher-allround')
    const front = m.fields.filter((f) => f.side === 'front')
    expect(Math.min(...front.map((f) => f.positionY))).toBeCloseTo(-2, 1)
  })
})
