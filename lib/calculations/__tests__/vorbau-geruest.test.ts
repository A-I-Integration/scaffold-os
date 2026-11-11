import { describe, it, expect } from 'vitest'
import { generateCADModel, vorbautenAlsAbschnitte, type BuildingParams } from '../cad-engine'

const basis = (extra: Partial<BuildingParams> = {}): BuildingParams => ({
  lengthM: 14, widthM: 9, heightM: 7, eavesHeightM: 0, roofHeightM: 0, roofForm: 'flachdach', floors: 2, sides: ['front', 'back', 'left', 'right'], ...extra,
} as BuildingParams)
const sys = 'layher-allround'

describe('Gerüst um Vorbau', () => {
  it('ohne Vorbau keine Ableitung', () => {
    expect(vorbautenAlsAbschnitte(basis(), 0.3, 0.3)).toBeNull()
  })
  it('Vorbau hinten: Abschnitte summieren sich zur Länge, zwei Seitenstücke', () => {
    const r = vorbautenAlsAbschnitte(basis({ vorbauten: [{ id: 'v0', side: 'back', offsetAlongM: 2, breiteM: 3, tiefeM: 1.5, hoeheM: 3 }] }), 0.3, 0.3)!
    expect(r.sections.reduce((t, x) => t + x.laengeM, 0)).toBeCloseTo(14, 2)
    expect(r.beine).toHaveLength(2)
    expect(r.sections.some((q) => q.tiefeM === 10.5)).toBe(true)
  })
  it('Modell: mehr Fläche und Felder, Gebäude bleibt einfach', () => {
    const ohne = generateCADModel(basis(), sys)
    const mit = generateCADModel(basis({ vorbauten: [{ id: 'v0', side: 'back', offsetAlongM: 2, breiteM: 3, tiefeM: 1.5, hoeheM: 3 }] }), sys)
    expect(mit.building.sections).toBeUndefined()
    expect(mit.fieldCount).toBeGreaterThan(ohne.fieldCount)
    expect(mit.totalAreaM2).toBeGreaterThan(ohne.totalAreaM2)
    expect(mit.fields.some((f) => f.id.includes('bein'))).toBe(true)
    expect(mit.warnings.some((w) => w.code === 'VORBAU_GERUEST')).toBe(true)
  })
  it('Kederplane: Hinweis auf Windlast und Statik', () => {
    const m = generateCADModel(basis({ geruestOptionen: { kederplane: { vonM: 0, bisM: 8 } } }), sys)
    expect(m.warnings.some((w) => w.code === 'PLANE_WIND')).toBe(true)
    expect(generateCADModel(basis(), sys).warnings.some((w) => w.code === 'PLANE_WIND')).toBe(false)
  })
})
