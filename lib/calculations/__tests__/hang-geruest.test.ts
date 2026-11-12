import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../cad-engine'

const basis = (extra: Partial<BuildingParams> = {}): BuildingParams => ({
  lengthM: 12, widthM: 9, heightM: 8, eavesHeightM: 0, roofHeightM: 0, roofForm: 'flachdach', floors: 3, sides: ['front', 'back', 'left', 'right'], ...extra,
} as BuildingParams)
const sys = 'layher-allround'
const lagenAn = (m: ReturnType<typeof generateCADModel>, side: string) => m.fields.filter((f) => f.side === side && f.index === 0).map((f) => f.levelIndex)

describe('Hang: Gelände je Seite', () => {
  it('ohne Angabe oder mit 0 ändert sich nichts', () => {
    const a = generateCADModel(basis(), sys), b = generateCADModel(basis({ geruestOptionen: { gelaendeSeiteM: { front: 0 } } }), sys)
    expect(b.fieldCount).toBe(a.fieldCount); expect(b.totalAreaM2).toBe(a.totalAreaM2); expect(b.levelCount).toBe(a.levelCount)
  })
  it('Talseite tiefer: mehr Lagen, Fußpunkt auf dem Gelände, mehr Fläche', () => {
    const a = generateCADModel(basis(), sys)
    const m = generateCADModel(basis({ geruestOptionen: { gelaendeSeiteM: { front: -2.5 } } }), sys)
    expect(lagenAn(m, 'front').length).toBeGreaterThan(lagenAn(a, 'front').length)
    expect(lagenAn(m, 'back')).toEqual(lagenAn(a, 'back'))
    const unten = m.fields.find((f) => f.side === 'front' && f.levelIndex === 0)!
    expect(unten.positionY).toBeCloseTo(-2.5, 2)
    expect(m.totalAreaM2).toBeCloseTo(a.totalAreaM2 + 12 * 2.5, 1)
    expect(m.warnings.some((w) => w.code === 'HANG_GERUEST')).toBe(true)
    // oberste Lage der Seite reicht mindestens bis zur Gebäudehöhe
    const oben = m.levels.filter((l) => l.id.startsWith('level-front-')).reduce((t, l) => Math.max(t, l.topY), 0)
    expect(oben).toBeGreaterThanOrEqual(8)
  })
  it('Gelände höher: weniger Lagen, Fußpunkt höher', () => {
    const a = generateCADModel(basis(), sys)
    const m = generateCADModel(basis({ geruestOptionen: { gelaendeSeiteM: { back: 2.2 } } }), sys)
    expect(lagenAn(m, 'back').length).toBeLessThan(lagenAn(a, 'back').length)
    expect(m.fields.find((f) => f.side === 'back' && f.levelIndex === 0)!.positionY).toBeCloseTo(2.2, 2)
  })
  it('Bauteile stehen auf dem Fußpunkt der Seite', () => {
    const m = generateCADModel(basis({ geruestOptionen: { gelaendeSeiteM: { front: -2.5 } } }), sys)
    const y = (side: string) => Math.min(...m.components3D.filter((c) => (c as { side?: string }).side === side || c.id.includes(`-${side}-`)).map((c) => c.position[1]))
    expect(Number.isFinite(y('front'))).toBe(true)
    expect(y('front')).toBeLessThan(0)
  })
  it('mit Satteldach: Giebel-Lagen laufen vom Gelände aus', () => {
    const b = basis({ roofForm: 'satteldach', eavesHeightM: 6, heightM: 9, geruestOptionen: { gelaendeSeiteM: { front: -2 } } })
    const m = generateCADModel(b, sys)
    expect(m.fields.length).toBeGreaterThan(0)
    expect(m.fields.find((f) => f.side === 'front' && f.levelIndex === 0)!.positionY).toBeCloseTo(-2, 2)
  })
})

describe('Hang: nicht unterstützte Gebäudeformen', () => {
  const hang = { gelaendeSeiteM: { front: -2 } }
  it('Umriss: Warnung statt stillem Ignorieren, Gerüst unverändert', () => {
    const u = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }]
    const a = generateCADModel(basis({ umriss: u }), sys)
    const m = generateCADModel(basis({ umriss: u, geruestOptionen: hang }), sys)
    expect(m.warnings.some((w) => w.code === 'HANG_NICHT_UNTERSTUETZT')).toBe(true)
    expect(a.warnings.some((w) => w.code === 'HANG_NICHT_UNTERSTUETZT')).toBe(false)
    expect(m.fieldCount).toBe(a.fieldCount)
  })
  it('Höhenabschnitte: Warnung', () => {
    const m = generateCADModel(basis({ lengthM: 30, sections: [{ laengeM: 10, hoeheM: 10, roofForm: 'flachdach', roofHoeheM: 0 }, { laengeM: 20, hoeheM: 6, roofForm: 'flachdach', roofHoeheM: 0 }] as never, geruestOptionen: hang }), sys)
    expect(m.warnings.some((w) => w.code === 'HANG_NICHT_UNTERSTUETZT')).toBe(true)
  })
})
