import { describe, it, expect } from 'vitest'
import { abstandM, hoeheM, winkelGrad, flaecheM2, messe } from '@/lib/cad/messen'

describe('Messen', () => {
  it('Abstand und Höhe', () => {
    expect(abstandM([0, 0, 0], [3, 4, 0])).toBeCloseTo(5)
    expect(hoeheM([1, 2, 3], [9, 5.5, -4])).toBeCloseTo(3.5)
    expect(hoeheM([0, 5, 0], [0, 2, 0])).toBeCloseTo(3)
  })
  it('Winkel am Scheitel', () => {
    expect(winkelGrad([1, 0, 0], [0, 0, 0], [0, 0, 1])).toBeCloseTo(90)
    expect(winkelGrad([1, 0, 0], [0, 0, 0], [-1, 0, 0])).toBeCloseTo(180)
    expect(winkelGrad([1, 0, 0], [0, 0, 0], [1, 1, 0])).toBeCloseTo(45)
    expect(winkelGrad([0, 0, 0], [0, 0, 0], [1, 0, 0])).toBeNull()
  })
  it('Fläche: Rechteck im Grundriss, an der Wand und Dreieck; unabhängig von der Umlaufrichtung', () => {
    const grund: [number, number, number][] = [[0, 0, 0], [4, 0, 0], [4, 0, 3], [0, 0, 3]]
    expect(flaecheM2(grund)).toBeCloseTo(12)
    expect(flaecheM2([...grund].reverse())).toBeCloseTo(12)
    expect(flaecheM2([[0, 0, 0], [5, 0, 0], [5, 2, 0], [0, 2, 0]])).toBeCloseTo(10)
    expect(flaecheM2([[0, 0, 0], [2, 0, 0], [0, 0, 2]])).toBeCloseTo(2)
    expect(flaecheM2([[0, 0, 0], [1, 0, 0]])).toBeNull()
  })
  it('messe() formatiert deutsch und verlangt genug Punkte', () => {
    expect(messe('abstand', [[0, 0, 0], [1.5, 0, 0]])?.text).toBe('1,50 m')
    expect(messe('abstand', [[0, 0, 0]])).toBeNull()
    expect(messe('winkel', [[1, 0, 0], [0, 0, 0], [0, 0, 1]])?.text).toBe('90,0°')
    expect(messe('koordinaten', [[1, 2.5, 3]])?.text).toBe('X 1,00 · Y 2,50 · Z 3,00 m')
    expect(messe('flaeche', [[0, 0, 0], [4, 0, 0], [4, 0, 3], [0, 0, 3]])?.text).toBe('12,00 m²')
  })
})
