import { describe, it, expect } from 'vitest'
import { vereinigeGeschosse } from '../geschoss-umriss'

const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]

describe('vereinigeGeschosse', () => {
  it('ein Rechteck bleibt ein Rechteck mit einer Höhe', () => {
    const r = vereinigeGeschosse([{ name: 'EG', obenM: 3, umriss: rect(0, 0, 10, 8) }])
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.umriss).toHaveLength(4); expect(r.kantenHoeheM.every((h) => h === 3)).toBe(true) }
  })
  it('EG breiter als OG: Kanten des Anbaus niedriger, Hauptbau hoch, Fläche stimmt', () => {
    const r = vereinigeGeschosse([
      { name: 'EG', obenM: 3, umriss: rect(0, 0, 14, 8) },
      { name: 'OG', obenM: 6, umriss: rect(0, 0, 10, 8) },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.hoechsteM).toBe(6)
    expect(r.umriss).toHaveLength(6) // Rechteck mit Stufe: 4 Ecken + 2 durch die Höhenstufe
    expect(new Set(r.kantenHoeheM)).toEqual(new Set([3, 6]))
    let fl = 0
    r.umriss.forEach((a, i) => { const b = r.umriss[(i + 1) % r.umriss.length]; fl += a.x * b.z - b.x * a.z })
    expect(Math.abs(fl / 2)).toBeCloseTo(14 * 8, 5)
  })
  it('Garage im UG ragt vor: bekommt ihre eigene Höhe', () => {
    const r = vereinigeGeschosse([
      { name: 'UG', obenM: 2.7, umriss: [...rect(0, 0, 10, 8), ] },
      { name: 'Garage', obenM: 2.7, umriss: rect(0, 8, 6, 13) },
      { name: 'EG', obenM: 5.8, umriss: rect(0, 0, 10, 8) },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.umriss).toHaveLength(7) // L-Form (6 Ecken) + 1 Punkt, wo sich die Höhe an der geraden Außenkante ändert
      expect(r.hoechsteM).toBe(5.8) }
  })
  it('schräge Kante: Fehlertext statt falschem Ergebnis', () => {
    const r = vereinigeGeschosse([{ name: 'X', obenM: 3, umriss: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 5, z: 6 }] }])
    expect(r.ok).toBe(false)
  })
})
