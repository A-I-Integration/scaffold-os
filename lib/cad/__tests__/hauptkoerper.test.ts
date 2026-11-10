import { describe, expect, it } from 'vitest'
import { hauptkoerperAusKontur } from '../hauptkoerper'

const mpp = 0.01 // 1 Punkt = 1 cm
const rechteck = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

describe('hauptkoerperAusKontur', () => {
  it('Rechteck: Hauptkörper = ganzes Rechteck, keine Vorbauten', () => {
    const h = hauptkoerperAusKontur(rechteck(0, 0, 1380, 870), mpp)!
    expect(h.laengeM).toBeCloseTo(13.8, 1); expect(h.breiteM).toBeCloseTo(8.7, 1); expect(h.vorbauten).toEqual([])
  })
  it('Haus mit kleinem Vorbau (wie WC-Erker): Hauptkörper ohne Vorbau, Vorbau gemeldet', () => {
    // 13,8 × 8,7 plus 4,3 × 1,5 nach oben
    const k = [{ x: 0, y: 150 }, { x: 660, y: 150 }, { x: 660, y: 0 }, { x: 1090, y: 0 }, { x: 1090, y: 150 }, { x: 1380, y: 150 }, { x: 1380, y: 1020 }, { x: 0, y: 1020 }]
    const h = hauptkoerperAusKontur(k, mpp)!
    expect(h.laengeM).toBeCloseTo(13.8, 1); expect(h.breiteM).toBeCloseTo(8.7, 1)
    expect(h.vorbauten).toHaveLength(1)
    expect(h.vorbauten[0].laengeM).toBeCloseTo(4.3, 1); expect(h.vorbauten[0].tiefeM).toBeCloseTo(1.5, 1)
  })
  it('L-Form: kein Hauptkörper (umschließendes Rechteck bleibt)', () => {
    const k = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 400 }, { x: 500, y: 400 }, { x: 500, y: 1000 }, { x: 0, y: 1000 }]
    expect(hauptkoerperAusKontur(k, mpp)).toBeNull()
  })
})
