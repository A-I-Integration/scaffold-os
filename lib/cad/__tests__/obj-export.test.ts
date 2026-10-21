import { describe, it, expect } from 'vitest'
import { dreieckeZuObj } from '../obj-export'
import { dreieckeAusObj } from '../modell-import'

describe('dreieckeZuObj', () => {
  it('Rundlauf: gleiche Dreiecke kommen beim Einlesen wieder heraus, gemeinsame Ecken werden zusammengelegt', () => {
    const d = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0])
    const obj = dreieckeZuObj(d, 'test')
    expect(obj.split('\n').filter((z) => z.startsWith('v ')).length).toBe(4)
    expect(Array.from(dreieckeAusObj(obj))).toEqual(Array.from(d))
  })
  it('leere Eingabe → keine Flächen', () => {
    expect(dreieckeAusObj(dreieckeZuObj(new Float32Array(0))).length).toBe(0)
  })
})
