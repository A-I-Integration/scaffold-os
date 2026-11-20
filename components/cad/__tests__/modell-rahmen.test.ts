import { describe, it, expect } from 'vitest'
import { modellRahmen } from '../Scaffold3D'
describe('modellRahmen', () => {
  it('leer ohne Bauteile', () => { expect(modellRahmen([])).toBeNull() })
  it('Rahmen aus den Positionen plus Rand, Boden bleibt enthalten', () => {
    const b = modellRahmen([{ position: [0, 1, 0] }, { position: [14, 8, 6] }], 1)!
    expect(b.min.toArray()).toEqual([-1, 0, -1])
    expect(b.max.toArray()).toEqual([15, 9, 7])
  })
})
