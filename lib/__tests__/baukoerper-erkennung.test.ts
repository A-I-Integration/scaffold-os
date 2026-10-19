import { describe, it, expect } from 'vitest'
import { erkenneBaukoerper, abschnitteAusBaukoerpern } from '../cad/baukoerper-erkennung'

type P = [number, number, number]
const tri = (a: P, b: P, c: P): number[] => [...a, ...b, ...c]
const quad = (a: P, b: P, c: P, d: P): number[][] => [tri(a, b, c), tri(a, c, d)]

/** Quader mit Wänden und Flachdach (x0..x1 Länge, z0..z1 Tiefe, Höhe h) */
function kasten(x0: number, z0: number, x1: number, z1: number, h: number): number[][] {
  return [
    ...quad([x0, z0, 0], [x1, z0, 0], [x1, z0, h], [x0, z0, h]),
    ...quad([x1, z0, 0], [x1, z1, 0], [x1, z1, h], [x1, z0, h]),
    ...quad([x1, z1, 0], [x0, z1, 0], [x0, z1, h], [x1, z1, h]),
    ...quad([x0, z1, 0], [x0, z0, 0], [x0, z0, h], [x0, z1, h]),
    ...quad([x0, z0, h], [x1, z0, h], [x1, z1, h], [x0, z1, h]),
  ]
}
/** Satteldach (First entlang x) auf Traufhöhe h */
function satteldach(x0: number, z0: number, x1: number, z1: number, h: number, dach: number): number[][] {
  const zm = (z0 + z1) / 2
  return [
    ...quad([x0, z0, h], [x1, z0, h], [x1, zm, h + dach], [x0, zm, h + dach]),
    ...quad([x0, zm, h + dach], [x1, zm, h + dach], [x1, z1, h], [x0, z1, h]),
    tri([x0, z0, h], [x0, zm, h + dach], [x0, z1, h]),
    tri([x1, z0, h], [x1, z1, h], [x1, zm, h + dach]),
  ]
}
/** Pyramide (Helm) auf Schafthöhe h */
function pyramide(x0: number, z0: number, x1: number, z1: number, h: number, dach: number): number[][] {
  const sp: P = [(x0 + x1) / 2, (z0 + z1) / 2, h + dach]
  return [tri([x0, z0, h], [x1, z0, h], sp), tri([x1, z0, h], [x1, z1, h], sp), tri([x1, z1, h], [x0, z1, h], sp), tri([x0, z1, h], [x0, z0, h], sp)]
}

describe('erkenneBaukoerper', () => {
  it('einfacher Kasten: ein Teil, nicht mehrteilig', () => {
    const e = erkenneBaukoerper(kasten(0, 0, 12, 8, 6))
    expect(e?.teile.length).toBe(1)
    expect(e?.mehrteilig).toBe(false)
    expect(e?.teile[0].hoeheM).toBeCloseTo(6, 0)
  })
  it('Kirche: Turm links (9 × 9, 45 m + 13 m Helm), Schiff rechts (30 × 12, Traufe 12, Dach 8)', () => {
    const tris = [
      ...kasten(0, 1.5, 9, 10.5, 45), ...pyramide(0, 1.5, 9, 10.5, 45, 13),
      ...kasten(9, 0, 39, 12, 12), ...satteldach(9, 0, 39, 12, 12, 8),
    ]
    const e = erkenneBaukoerper(tris)!
    expect(e.teile.length).toBe(2)
    expect(e.mehrteilig).toBe(true)
    expect(e.turmIndex).not.toBeNull()
    const turm = e.teile[e.turmIndex!], schiff = e.teile[1 - e.turmIndex!]
    expect(turm.laengeM).toBeCloseTo(9, 0)
    expect(turm.tiefeM).toBeCloseTo(9, 0)
    expect(turm.hoeheM).toBeCloseTo(45, 0)
    expect(turm.dachForm).toBe('walmdach')
    expect(turm.dachHoeheM).toBeCloseTo(13, 0)
    expect(schiff.laengeM).toBeCloseTo(30, 0)
    expect(schiff.tiefeM).toBeCloseTo(12, 0)
    expect(schiff.hoeheM).toBeCloseTo(12, 0)
    expect(schiff.dachForm).toBe('satteldach')
    expect(schiff.dachHoeheM).toBeCloseTo(8, 0)
    expect(Math.abs(turm.versatzM)).toBeLessThan(0.6)
  })
  it('gedrehte Kirche wird genauso erkannt', () => {
    const w = (27 * Math.PI) / 180, c = Math.cos(w), s = Math.sin(w)
    const tris = [
      ...kasten(0, 1.5, 9, 10.5, 45), ...pyramide(0, 1.5, 9, 10.5, 45, 13),
      ...kasten(9, 0, 39, 12, 12), ...satteldach(9, 0, 39, 12, 12, 8),
    ].map((t) => [t[0] * c - t[1] * s, t[0] * s + t[1] * c, t[2], t[3] * c - t[4] * s, t[3] * s + t[4] * c, t[5], t[6] * c - t[7] * s, t[6] * s + t[7] * c, t[8]])
    const e = erkenneBaukoerper(tris)!
    expect(e.teile.length).toBe(2)
    expect(e.turmIndex).not.toBeNull()
    expect(e.teile[e.turmIndex!].hoeheM).toBeCloseTo(45, 0)
  })
  it('Abschnitte fürs CAD: nur Turm eingerüstet, Schiff nur dargestellt, Turm schmaler', () => {
    const tris = [
      ...kasten(0, 1.5, 9, 10.5, 45), ...pyramide(0, 1.5, 9, 10.5, 45, 13),
      ...kasten(9, 0, 39, 12, 12), ...satteldach(9, 0, 39, 12, 12, 8),
    ]
    const e = erkenneBaukoerper(tris)!
    const a = abschnitteAusBaukoerpern(e, true)
    const t = a[e.turmIndex!], s = a[1 - e.turmIndex!]
    expect(t.geruest).toBeUndefined()
    expect(t.helmGeruest).toBe(true)
    expect(t.tiefeM).toBeCloseTo(9, 0)
    expect(s.geruest).toBe(false)
    expect(s.tiefeM).toBeUndefined()
    expect(abschnitteAusBaukoerpern(e, false).every((x) => x.geruest === undefined)).toBe(true)
  })
  it('Haus mit niedrigem Anbau, gleiche Tiefe: zwei Teile, kein Turm', () => {
    const e = erkenneBaukoerper([...kasten(0, 0, 12, 8, 9), ...kasten(12, 0, 18, 8, 4)])!
    expect(e.teile.length).toBe(2)
    expect(e.turmIndex).toBeNull()
  })
})
