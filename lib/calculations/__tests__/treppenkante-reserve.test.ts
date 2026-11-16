import { describe, it, expect } from 'vitest'
import { waehleTreppenKanteReserve } from '../cad-engine'

describe('Treppenkante-Reserve (Umriss)', () => {
  it('nimmt die längste Kante nach der untersten vorhandenen Lage, auch wenn Lage 0 fehlt', () => {
    const f = [
      { kante: 0, levelIndex: 1, lengthM: 2 }, { kante: 0, levelIndex: 1, lengthM: 2 }, { kante: 0, levelIndex: 2, lengthM: 2 },
      { kante: 1, levelIndex: 2, lengthM: 2 }, { kante: 1, levelIndex: 3, lengthM: 2 },
    ]
    expect(waehleTreppenKanteReserve(f)).toBe(0)
  })
  it('ohne Kanten: undefined', () => {
    expect(waehleTreppenKanteReserve([{ levelIndex: 0, lengthM: 2 }])).toBeUndefined()
    expect(waehleTreppenKanteReserve([])).toBeUndefined()
  })
})
