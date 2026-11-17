import { describe, it, expect } from 'vitest'
import { profilAusAnsicht } from '../ansicht-profil'
import type { VektorFlaeche } from '../pdf-vektoren'

const MPP = (0.0254 / 72) * 100
const pt = (m: number) => m / MPP
const rect = (fill: string, cx: number, y0m: number, y1m: number, bM: number, boden: number): VektorFlaeche => {
  const x0 = cx - pt(bM) / 2, x1 = cx + pt(bM) / 2, ya = boden - pt(y1m), yb = boden - pt(y0m)
  return { fill, ringe: [[[x0, ya], [x1, ya], [x1, yb], [x0, yb]]], bbox: [x0, ya, x1, yb] }
}

describe('profilAusAnsicht', () => {
  const boden = 900, cx = 300
  it('trennt Schaft (10 m breit, 30 m hoch) von Helm (6 m breit, 10 m hoch); Gesims von 0,5 m zählt nicht', () => {
    const fl = [rect('#37bfff', cx, 0, 30, 10, boden), rect('#aaaaaa', cx, 29.5, 30, 11.4, boden), rect('#fb8c00', cx, 30, 40, 6, boden)]
    const p = profilAusAnsicht(fl, 100, boden, cx, 10, 0.25)!
    expect(p.schaftBreiteM).toBeCloseTo(10, 1)
    expect(Math.abs(p.schaftHoeheM - 30)).toBeLessThanOrEqual(0.5) // Gesims und Helm grenzen an: Trennung am Gesimsfuß
    expect(Math.abs(p.helmHoeheM - 10)).toBeLessThanOrEqual(0.5)
    expect(p.helmMaxBreiteM).toBeCloseTo(6, 1)
  })
  it('Schaft bis oben: Helmhöhe 0', () => {
    const p = profilAusAnsicht([rect('#37bfff', cx, 0, 20, 8, boden)], 100, boden, cx, 8, 0.25)!
    expect(p.helmHoeheM).toBe(0)
    expect(p.schaftHoeheM).toBeCloseTo(20, 0)
  })
  it('weit entfernte Flächen (Seitenschiff) und dunkle Flächen zählen nicht', () => {
    const fl = [rect('#37bfff', cx, 0, 20, 8, boden), rect('#e4e1c9', cx + pt(15), 0, 12, 10, boden), rect('#000000', cx, 0, 25, 8, boden)]
    const p = profilAusAnsicht(fl, 100, boden, cx, 8, 0.25)!
    expect(p.gesamtHoeheM).toBeCloseTo(20, 0)
  })
  it('zu kleine Fläche → null', () => {
    expect(profilAusAnsicht([rect('#37bfff', cx, 0, 1, 8, boden)], 100, boden, cx, 8)).toBeNull()
  })
})
