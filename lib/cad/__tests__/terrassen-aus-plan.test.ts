import { describe, it, expect } from 'vitest'
import { terrassenFinden } from '../terrassen-aus-plan'
import type { VektorFlaeche } from '../pdf-vektoren'

const MPP = 0.0254 / 72 * 100 // 1:100
const m = (v: number) => v / MPP // Meter → Punkte
const rechteck = (x0: number, y0: number, x1: number, y1: number, fill = '#ffffff'): VektorFlaeche => ({ fill, ringe: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]], bbox: [x0, y0, x1, y1] })
const geschoss = [{ ebene: 1, bbox: [1000, 1000, 1000 + m(10), 1000 + m(8)] as [number, number, number, number] }]

describe('Terrassen aus dem Plan (synthetisch)', () => {
  const rechts = rechteck(1000 + m(10), 1000 + m(1), 1000 + m(13.8), 1000 + m(9.3)) // 3,8 × 8,3 m, grenzt rechts ans Geschoss
  const text = { s: 'Terrasse OG', x: 1000 + m(11), y: 1000 + m(5) }
  it('findet die kleinste rechteckige Zone um die Beschriftung und ordnet sie dem angrenzenden Geschoss zu', () => {
    const t = terrassenFinden([rechts], [text], geschoss, MPP, { x: 1000 + m(5), y: 1000 + m(4) })
    expect(t).toHaveLength(1)
    expect(t[0].ebene).toBe(1)
    expect(t[0].laengeM).toBeCloseTo(3.8, 1)
    expect(t[0].tiefeM).toBeCloseTo(8.3, 1)
    expect(t[0].x).toBeCloseTo(6.9, 1)
  })
  it('Sammelzone über 60 m² oder zu weit vom Geschoss entfernt: nichts geraten', () => {
    const gross = rechteck(1000 - m(5), 1000 - m(5), 1000 + m(20), 1000 + m(15))
    expect(terrassenFinden([gross], [text], geschoss, MPP, { x: 0, y: 0 })).toEqual([])
    const weit = rechteck(1000 + m(20), 1000, 1000 + m(23), 1000 + m(3))
    expect(terrassenFinden([weit], [{ s: 'Terrasse', x: 1000 + m(21), y: 1000 + m(1) }], geschoss, MPP, { x: 0, y: 0 })).toEqual([])
  })
  it('Geländer-Beschriftung und andere Wörter zählen nicht', () => {
    expect(terrassenFinden([rechts], [{ s: 'Terrassengeländer H= 1,00 m', x: text.x, y: text.y }, { s: 'Bad', x: text.x, y: text.y }], geschoss, MPP, { x: 0, y: 0 })).toEqual([])
  })
})
