import { describe, it, expect } from 'vitest'
import { generateCADModel, calculateLogistics, stufenFlaecheM2, type BuildingParams } from '../calculations/cad-engine'

const basis: BuildingParams = {
  lengthM: 20, widthM: 10, heightM: 31, eavesHeightM: 31, roofHeightM: 0, roofForm: 'flachdach',
  floors: 10, floorHeightsM: Array(10).fill(3.1), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
}

describe('Stunden folgen dem gebauten Gerüst', () => {
  it('Höhe 31 m, Raster 2 m: oberste Lage 32 m, Stunden mit gebauter Fläche, Abrechnungsfläche unverändert', () => {
    const m = generateCADModel(basis, 'layher-allround')
    expect(m.levelCount).toBe(16)
    expect(m.totalAreaM2).toBeCloseTo(20 * 31, 2)
    expect(m.gebauteFlaecheM2).toBeCloseTo(20 * 32, 2)
    expect(calculateLogistics(m, [], 2).aufbauStunden).toBe(Math.ceil(20 * 32 * 2))
  })
  it('Höhe passt genau auf das Raster: kein Unterschied', () => {
    const m = generateCADModel({ ...basis, heightM: 30, eavesHeightM: 30 }, 'layher-allround')
    expect(m.gebauteFlaecheM2).toBeCloseTo(m.totalAreaM2, 2)
  })
  it('Abschnitte: jede Höhe wird auf die oberste Lage aufgerundet', () => {
    const abschnitte = [
      { laengeM: 10, hoeheM: 11, tiefeM: 5 },
      { laengeM: 9, hoeheM: 31, tiefeM: 9 },
    ] as Parameters<typeof stufenFlaecheM2>[0]
    const ohne = stufenFlaecheM2(abschnitte, ['front', 'back', 'left', 'right'], 9)
    const mit = stufenFlaecheM2(abschnitte, ['front', 'back', 'left', 'right'], 9, 2)
    // front/back: 10×12 + 9×32 je Seite statt 10×11 + 9×31; left: 5×12; right: 9×32
    expect(mit).toBeCloseTo(2 * (10 * 12 + 9 * 32) + 5 * 12 + 9 * 32, 2)
    expect(mit).toBeGreaterThan(ohne)
  })
  it('Modell ohne gebaute Fläche: Stunden wie bisher aus der Abrechnungsfläche', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const alt = { ...m, gebauteFlaecheM2: undefined }
    expect(calculateLogistics(alt, [], 2).aufbauStunden).toBe(Math.ceil(m.totalAreaM2 * 2))
  })
})
