import { describe, it, expect } from 'vitest'
import { createInitialLayerState, kantenSchluessel, seitenBezeichnung } from '../../types/cad-layers'

describe('Ebenen: Umriss-Kanten', () => {
  it('Rechteck: wie bisher vier Seiten', () => {
    const s = createInitialLayerState(['front', 'left'], 3)
    expect(s.sides).toEqual({ front: true, back: false, left: true, right: false })
    expect(Object.keys(s.levels)).toHaveLength(3)
  })
  it('Umriss: je Kante ein Schalter, alle sichtbar', () => {
    const s = createInitialLayerState(['front'], 2, 6)
    expect(Object.keys(s.sides)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5'])
    expect(Object.values(s.sides).every(Boolean)).toBe(true)
  })
  it('Bezeichnungen', () => {
    expect(seitenBezeichnung('front')).toBe('Vorderseite')
    expect(seitenBezeichnung(kantenSchluessel(0))).toBe('Kante 1')
    expect(seitenBezeichnung('k5')).toBe('Kante 6')
    expect(seitenBezeichnung('xyz')).toBe('xyz')
  })
})
