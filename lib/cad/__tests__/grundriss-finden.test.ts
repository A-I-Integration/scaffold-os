import { describe, it, expect } from 'vitest'
import { geschossAusTitel, grundrisseFinden } from '../grundriss-finden'
import type { VektorFlaeche } from '../pdf-vektoren'

const M = 0.01 // 1 Punkt = 1 cm
const rect = (x0: number, y0: number, x1: number, y1: number): number[][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const fl = (fill: string, ringe: number[][][]): VektorFlaeche => {
  const xs = ringe.flat().map((p) => p[0]), ys = ringe.flat().map((p) => p[1])
  return { fill, ringe, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
}
/** Rechteck-Haus aus vier Wandstücken (20 cm stark), Maße in Punkten (1 pt = 1 cm) */
const haus = (x: number, y: number, b: number, t: number, farbe = '#ff8000') =>
  fl(farbe, [rect(x, y, x + b, y + 20), rect(x, y + t - 20, x + b, y + t), rect(x, y, x + 20, y + t), rect(x + b - 20, y, x + b, y + t)])

describe('geschossAusTitel', () => {
  it('erkennt Geschosse', () => {
    expect(geschossAusTitel('KELLERGESCHOSS')?.ebene).toBe(-1)
    expect(geschossAusTitel('ERDGESCHOSS')?.ebene).toBe(0)
    expect(geschossAusTitel('1. OBERGESCHOSS')?.ebene).toBe(1)
    expect(geschossAusTitel('2.OBERGESCHOSS')?.ebene).toBe(2)
  })
  it('ignoriert Schnitte und sonstigen Text', () => {
    expect(geschossAusTitel('SCHNITT A-A')).toBeNull()
    expect(geschossAusTitel('EG')).toBeNull()
    expect(geschossAusTitel('Lageplan')).toBeNull()
  })
})

describe('grundrisseFinden', () => {
  it('findet zwei Geschosse nebeneinander und trennt sie', () => {
    const flaechen = [haus(0, 0, 1400, 1000), haus(3000, 0, 1000, 1000)]
    // Wände brauchen genug Stücke → je Seite zwei Teilstücke
    const texte = [
      { s: 'ERDGESCHOSS', x: 0, y: 1200 },
      { s: '1. OBERGESCHOSS', x: 3000, y: 1200 },
    ]
    // 4 Ringe je Haus reichen für "mindestens 4 Stücke"
    const r = grundrisseFinden(flaechen, texte, M)
    expect(r.map((g) => g.titel)).toEqual(['ERDGESCHOSS', '1. OBERGESCHOSS'])
    expect(r[0].breiteM).toBeCloseTo(14, 1)
    expect(r[0].tiefeM).toBeCloseTo(10, 1)
    expect(r[1].breiteM).toBeCloseTo(10, 1)
  })
  it('liefert nichts ohne Überschrift', () => {
    expect(grundrisseFinden([haus(0, 0, 1400, 1000)], [], M)).toEqual([])
  })
  it('lässt Schnitt-Überschriften aus', () => {
    expect(grundrisseFinden([haus(0, 0, 1400, 1000)], [{ s: 'SCHNITT A-A', x: 0, y: 1200 }], M)).toEqual([])
  })
})
