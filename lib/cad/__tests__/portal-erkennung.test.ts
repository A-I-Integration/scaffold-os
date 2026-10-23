import { describe, it, expect } from 'vitest'
import { erkenneSchaftImGeruest } from '../geruest-modell'
import { erkennePortale, portalAlsTuer } from '../portal-erkennung'

type Dr = number[]
const rechteckWaagrecht = (x0: number, x1: number, y0: number, y1: number, h: number, teile = 1): Dr[] => {
  const t: Dr[] = []
  for (let i = 0; i < teile; i++) {
    const a = x0 + ((x1 - x0) * i) / teile, b = x0 + ((x1 - x0) * (i + 1)) / teile
    t.push([a, y0, h, b, y0, h, b, y1, h], [a, y0, h, b, y1, h, a, y1, h])
  }
  return t
}
const wand = (x0: number, y0: number, x1: number, y1: number, h: number): Dr[] => [[x0, y0, 0, x1, y1, 0, x1, y1, h], [x0, y0, 0, x1, y1, h, x0, y0, h]]

/** Turm 8 × 8 m, 14 m hoch, Gerüstlagen alle 2 m (Beläge), optional Portalvorbau an der Seite y = -4 */
function modell(portal: boolean): Dr[] {
  const t: Dr[] = []
  t.push(...rechteckWaagrecht(-4, 4, -4, 4, 14))
  t.push(...wand(-4, -4, 4, -4, 14), ...wand(4, -4, 4, 4, 14), ...wand(4, 4, -4, 4, 14), ...wand(-4, 4, -4, -4, 14))
  for (let h = 2; h <= 12; h += 2) t.push(...rechteckWaagrecht(-6, 6, -6, 6, h, 120))
  if (portal) t.push(...rechteckWaagrecht(-1.8, 1.8, -5.2, -4, 3.3))
  // frei stehender Körper (z. B. Aufzugsfuß), nicht an der Wand
  t.push(...rechteckWaagrecht(5.5, 7.5, -7.5, -6, 3.3))
  return t
}

describe('Portal-Erkennung', () => {
  it('findet den Vorbau an der Turmwand mit Breite, Höhe und Tiefe', () => {
    const s = erkenneSchaftImGeruest(modell(true))
    expect(s).not.toBeNull()
    const p = erkennePortale(modell(true), s!.schaftLage, s!.geruest.lagenM)
    expect(p).toHaveLength(1)
    expect(p[0].breiteM).toBeCloseTo(3.6, 1)
    expect(p[0].hoeheM).toBeCloseTo(3.3, 1)
    expect(p[0].tiefeM).toBeCloseTo(1.2, 1)
    expect(Math.abs(p[0].mitteM)).toBeLessThan(0.1)
  })
  it('ohne Vorbau kein Vorschlag; Gerüstbeläge und frei stehende Teile zählen nicht', () => {
    const s = erkenneSchaftImGeruest(modell(false))
    expect(s).not.toBeNull()
    expect(erkennePortale(modell(false), s!.schaftLage, s!.geruest.lagenM)).toEqual([])
  })
  it('macht aus dem Portal eine Tür mit denselben Maßen', () => {
    const t = portalAlsTuer({ seite: 'left', mitteM: 0.5, breiteM: 3.6, hoeheM: 3.3, tiefeM: 1.2 }, 0)
    expect(t).toEqual({ id: 'portal-1', side: 'left', offsetAlongM: 0.5, widthM: 3.6, heightM: 3.3 })
  })
})
