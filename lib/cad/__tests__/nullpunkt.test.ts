import { describe, it, expect } from 'vitest'
import { bestimmeNullpunkt } from '../modell-analyse'

/** Waagrechtes Rechteck (x0..x1 × y0..y1) auf Höhe h als zwei Dreiecke: x,y,h je Ecke. */
const platte = (x0: number, y0: number, x1: number, y1: number, h: number): number[][] => [
  [x0, y0, h, x1, y0, h, x1, y1, h],
  [x0, y0, h, x1, y1, h, x0, y1, h],
]

describe('Nullpunkt der Höhen (Unterkante des Bauwerks statt tiefster Punkt)', () => {
  it('Fußspindel-Platte unter dem Gelände zählt nicht: Nullpunkt = große Fläche darüber', () => {
    const tris = [...platte(0, 0, 0.15, 0.15, 0), ...platte(0, 0, 9, 9, 0.2156), ...platte(0, 0, 9, 9, 31.2156)]
    const r = bestimmeNullpunkt(tris)
    expect(r.verschiebungM).toBeCloseTo(0.2156, 3)
    expect(r.hinweis).toContain('22 cm')
  })

  it('große Fläche ganz unten: keine Verschiebung', () => {
    expect(bestimmeNullpunkt([...platte(0, 0, 9, 9, 0), ...platte(0, 0, 9, 9, 12)]).verschiebungM).toBe(0)
  })

  it('Unterkante mehr als 1 m über dem tiefsten Punkt (z. B. Keller): bleibt beim tiefsten Punkt', () => {
    expect(bestimmeNullpunkt([...platte(0, 0, 0.2, 0.2, 0), ...platte(0, 0, 9, 9, 2.5), ...platte(0, 0, 9, 9, 12)]).verschiebungM).toBe(0)
  })

  it('ohne waagrechte Flächen: keine Verschiebung', () => {
    expect(bestimmeNullpunkt([[0, 0, 0, 1, 0, 5, 0, 1, 5]]).verschiebungM).toBe(0)
  })
})
