import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../cad-engine'

const basis = (ueberbauen: boolean): BuildingParams => ({
  lengthM: 12, widthM: 9, heightM: 7, eavesHeightM: 0, roofHeightM: 0, roofForm: 'flachdach', floors: 2, sides: ['front', 'back', 'left', 'right'],
  tueren: [{ id: 'a', side: 'front', offsetAlongM: 0, widthM: 1, heightM: 2.1 }, { id: 'b', side: 'back', offsetAlongM: 0, widthM: 1, heightM: 2.1, ...(ueberbauen ? { ueberbauen: true } : {}) }],
} as BuildingParams)

describe('Tür überbauen', () => {
  it('nur die als überbaut markierte Tür bleibt zu', () => {
    const m = generateCADModel(basis(true), 'layher-allround')
    expect(m.warnings.map((x) => x.code)).toContain('TUER_ZUGEBAUT')
    expect(m.fields.some((f) => f.side === 'front' && f.durchgang)).toBe(true)
    expect(m.fields.some((f) => f.side === 'back' && f.durchgang)).toBe(false)
  })
  it('ohne Markierung sind beide frei', () => {
    const m = generateCADModel(basis(false), 'layher-allround')
    expect(m.warnings.map((x) => x.code)).not.toContain('TUER_ZUGEBAUT')
    expect(m.fields.some((f) => f.side === 'back' && f.durchgang)).toBe(true)
  })
})
