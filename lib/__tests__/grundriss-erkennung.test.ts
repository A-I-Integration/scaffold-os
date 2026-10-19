import { describe, it, expect } from 'vitest'
import { erkenneGrundriss, type Dreieck2 } from '../cad/grundriss-erkennung'

/** Rechteck als zwei Dreiecke (Dach, von oben gesehen), optional gedreht. */
function rechteck(x0: number, z0: number, x1: number, z1: number, grad = 0): Dreieck2[] {
  const w = (grad * Math.PI) / 180, c = Math.cos(w), s = Math.sin(w)
  const r = (x: number, z: number): [number, number] => [x * c - z * s, x * s + z * c]
  const a = r(x0, z0), b = r(x1, z0), cc = r(x1, z1), d = r(x0, z1)
  return [[...a, ...b, ...cc], [...a, ...cc, ...d]]
}
const mass = (e: ReturnType<typeof erkenneGrundriss>) => e && [e.laengeM, e.breiteM]

describe('erkenneGrundriss', () => {
  it('Rechteck: 4 Ecken', () => {
    const e = erkenneGrundriss({ dreiecke: rechteck(0, 0, 12, 8) })
    expect(e?.form).toBe('rechteck')
    expect(e?.ecken).toBe(4)
    expect(mass(e)![0]).toBeCloseTo(12, 0)
    expect(mass(e)![1]).toBeCloseTo(8, 0)
  })
  it('Rechteck nur aus den 8 Eckpunkten eines Quaders (Kanten dazwischen leer)', () => {
    const pts: [number, number][] = [[0, 0], [20, 0], [20, 10], [0, 10], [0, 0], [20, 0], [20, 10], [0, 10]]
    const e = erkenneGrundriss({ punkte: pts })
    // nur Eckpunkte: Hülle wird über den Lückenschluss nicht gefüllt – ohne Wandflächen darf nichts Falsches entstehen
    expect(e === null || e.form === 'rechteck').toBe(true)
  })
  it('L-Form: 6 Ecken, 1 Innenecke', () => {
    const e = erkenneGrundriss({ dreiecke: [...rechteck(0, 0, 14, 6), ...rechteck(0, 6, 6, 12)] })
    expect(e?.form).toBe('l-form')
    expect(e?.ecken).toBe(6)
    expect(e?.innenecken).toBe(1)
    expect(e?.flaecheM2).toBeCloseTo(14 * 6 + 6 * 6, -1)
  })
  it('gedrehtes Rechteck wird gerade ausgerichtet erkannt (4 Ecken)', () => {
    const e = erkenneGrundriss({ dreiecke: rechteck(0, 0, 18, 9, 33) })
    expect(e?.form).toBe('rechteck')
    expect(mass(e)![0]).toBeCloseTo(18, 0)
    expect(mass(e)![1]).toBeCloseTo(9, 0)
  })
  it('gedrehte L-Form bleibt L-Form', () => {
    const l = [...rechteck(0, 0, 14, 6), ...rechteck(0, 6, 6, 12)]
    const w = (25 * Math.PI) / 180, c = Math.cos(w), s = Math.sin(w)
    const rot = l.map((d) => [d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2] * c - d[3] * s, d[2] * s + d[3] * c, d[4] * c - d[5] * s, d[4] * s + d[5] * c] as Dreieck2)
    const e = erkenneGrundriss({ dreiecke: rot })
    expect(e?.form).toBe('l-form')
  })
  it('Kirche: Schiff mit schmalerem Turm am Ende ergibt ein Vieleck mit 8 Ecken', () => {
    const e = erkenneGrundriss({ dreiecke: [...rechteck(0, 0, 30, 12), ...rechteck(30, 1.5, 39, 10.5)] })
    expect(e?.form).toBe('vieleck')
    expect(e?.ecken).toBe(8)
  })
  it('Punktwolke mit Rauschen: Rechteck bleibt Rechteck', () => {
    const pts: [number, number][] = []
    let s = 7
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    for (let i = 0; i < 6000; i++) pts.push([rnd() * 16, rnd() * 9])
    for (let i = 0; i < 20; i++) pts.push([rnd() * 40 - 12, rnd() * 30 - 10]) // Streupunkte
    const e = erkenneGrundriss({ punkte: pts })
    expect(e?.form).toBe('rechteck')
  })
  it('zu wenig Daten: null', () => {
    expect(erkenneGrundriss({ punkte: [[0, 0], [1, 1]] })).toBeNull()
  })
})
