import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../cad-engine'

const basis = (ueberbauen: boolean): BuildingParams => ({
  lengthM: 12, widthM: 9, heightM: 7, eavesHeightM: 0, roofHeightM: 0, roofForm: 'flachdach', floors: 2, sides: ['front', 'back', 'left', 'right'], geruestOptionen: { tuerenFreihalten: true },
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

describe('Durchfahrt', () => {
  it('große Öffnung hält mehrere Lagen frei und meldet die Überbrückung als nicht bemessen', () => {
    const b = { lengthM: 14, widthM: 9, heightM: 10, eavesHeightM: 0, roofHeightM: 0, roofForm: 'flachdach', floors: 3, sides: ['front', 'back', 'left', 'right'], geruestOptionen: { tuerenFreihalten: true },
      tueren: [{ id: 'd', side: 'front', offsetAlongM: 0, widthM: 3.5, heightM: 4.5, durchfahrt: true }] } as BuildingParams
    const m = generateCADModel(b, 'layher-allround')
    expect(m.warnings.map((w) => w.code)).toContain('DURCHFAHRT_BRUECKE')
    expect(m.fields.filter((f) => f.durchgang && f.levelIndex >= 1).length).toBeGreaterThan(0)
  })
})
