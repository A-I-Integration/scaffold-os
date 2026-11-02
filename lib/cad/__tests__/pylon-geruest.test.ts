import { describe, it, expect } from 'vitest'
import { rechnePylonGeruest } from '../pylon-geruest'

const basis = { hoehe: 20, neigungGrad: 0, breite: 2.2, tiefe: 4.4, wandabstand: 0.3, gerueste_breite: 0.9, lagenhoehe: 2, feldlaenge: 2.5 }

describe('rechnePylonGeruest', () => {
  it('senkrecht: wie ein Baukörper, 10 Lagen, kein Versatz', () => {
    const r = rechnePylonGeruest(basis)
    expect(r.lagen).toHaveLength(10)
    expect(r.kopfVersatz).toBeCloseTo(0)
    expect(r.schnittTiefe).toBeCloseTo(4.4)
    // Außenmaß: 2,2 + 2*1,2 = 4,6 und 4,4 + 2*1,2 = 6,8 -> Umfang 22,8
    expect(r.lagen[0].umfang).toBeCloseTo(22.8)
    expect(r.gesamtFlaeche).toBeCloseTo(22.8 * 20)
  })

  it('geneigt: waagerechte Schnitttiefe = Tiefe / cos, Lage wird um Lagenhöhe * tan tiefer', () => {
    const r = rechnePylonGeruest({ ...basis, neigungGrad: 30 })
    const tan = Math.tan(Math.PI / 6)
    expect(r.schnittTiefe).toBeCloseTo(4.4 / Math.cos(Math.PI / 6))
    expect(r.lagen[0].tiefeAussen).toBeCloseTo(4.4 / Math.cos(Math.PI / 6) + 2 * tan + 2.4)
    expect(r.kopfVersatz).toBeCloseTo(20 * tan)
    expect(r.achslaenge).toBeCloseTo(20 / Math.cos(Math.PI / 6))
  })

  it('Versatz wächst von Lage zu Lage um Lagenhöhe * tan', () => {
    const r = rechnePylonGeruest({ ...basis, neigungGrad: 20 })
    const schritt = 2 * Math.tan((20 * Math.PI) / 180)
    expect(r.lagen[1].versatz - r.lagen[0].versatz).toBeCloseTo(schritt)
  })

  it('letzte Lage ist kürzer, wenn die Höhe kein Vielfaches ist', () => {
    const r = rechnePylonGeruest({ ...basis, hoehe: 5 })
    expect(r.lagen.map((l) => l.hoehe)).toEqual([2, 2, 1])
  })

  it('mehr Neigung heißt mehr Fläche und mehr Felder', () => {
    const a = rechnePylonGeruest({ ...basis, neigungGrad: 0 })
    const b = rechnePylonGeruest({ ...basis, neigungGrad: 25 })
    expect(b.gesamtFlaeche).toBeGreaterThan(a.gesamtFlaeche)
    expect(b.gesamtFelder).toBeGreaterThanOrEqual(a.gesamtFelder)
  })

  it('Hinweis auf Einzelstatik nur bei Neigung', () => {
    expect(rechnePylonGeruest(basis).hinweise).toHaveLength(0)
    expect(rechnePylonGeruest({ ...basis, neigungGrad: 5 }).hinweise.length).toBeGreaterThan(0)
  })

  it('ungültige Eingaben werfen', () => {
    expect(() => rechnePylonGeruest({ ...basis, hoehe: 0 })).toThrow()
    expect(() => rechnePylonGeruest({ ...basis, neigungGrad: 90 })).toThrow()
    expect(() => rechnePylonGeruest({ ...basis, breite: 0 })).toThrow()
  })
})
