import { describe, it, expect } from 'vitest'
import { fangePunkt, figurenZuDxf, figurPruefen, kantenLaenge, type ZPunkt, type FangOptionen } from '../dxf-zeichnen'
import { leseDxfUmriss, type DxfUmrissErgebnis } from '../dxf-umriss'
import { abschnitteAusTeileListe } from '../modell-analyse'

const opt: FangOptionen = { rasterM: 0.5, punktRadiusM: 0.4, achsenRadiusM: 0.3 }
const ok = (r: ReturnType<typeof leseDxfUmriss>): DxfUmrissErgebnis => { if (!r.ok) throw new Error(r.grund); return r }

describe('fangePunkt', () => {
  it('rastet auf vorhandene Punkte (auch Startpunkt) vor allem anderen', () => {
    expect(fangePunkt({ x: 0.2, z: 0.1 }, { x: 5, z: 0.1 }, [{ x: 0, z: 0 }], opt)).toEqual({ punkt: { x: 0, z: 0 }, art: 'punkt' })
  })
  it('rastet waagerecht/senkrecht zum vorigen Punkt, Raster auf der anderen Achse', () => {
    expect(fangePunkt({ x: 6.2, z: 0.2 }, { x: 0, z: 0 }, [], opt)).toEqual({ punkt: { x: 6, z: 0 }, art: 'achse' })
    expect(fangePunkt({ x: 0.15, z: 4.8 }, { x: 0, z: 0 }, [], opt)).toEqual({ punkt: { x: 0, z: 5 }, art: 'achse' })
  })
  it('Raster und frei', () => {
    expect(fangePunkt({ x: 3.3, z: 2.9 }, { x: 0, z: 0 }, [], opt)).toEqual({ punkt: { x: 3.5, z: 3 }, art: 'raster' })
    expect(fangePunkt({ x: 3.337, z: 2.9 }, null, [], { ...opt, rasterM: 0 }).art).toBe('frei')
  })
})

describe('figurPruefen', () => {
  it('erkennt zu wenige Ecken, doppelte Punkte, Fläche 0', () => {
    expect(figurPruefen([{ x: 0, z: 0 }, { x: 1, z: 0 }])).toMatch(/mindestens 3/)
    expect(figurPruefen([{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 1 }])).toMatch(/demselben Punkt/)
    expect(figurPruefen([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }])).toMatch(/keine Fläche/)
    expect(figurPruefen([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }])).toBeNull()
    expect(kantenLaenge({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5)
  })
})

describe('gezeichnete Figuren → gleicher Leseweg wie DXF', () => {
  const rechteck = (x: number, z: number, b: number, t: number): ZPunkt[] => [{ x, z }, { x: x + b, z }, { x: x + b, z: z + t }, { x, z: z + t }]
  it('Rechteck 12 × 8 m', () => {
    const e = ok(leseDxfUmriss(figurenZuDxf([rechteck(0, 0, 12, 8)])))
    expect(e.form).toBe('rechteck')
    expect(e.laengeM).toBeCloseTo(12, 1)
    expect(e.breiteM).toBeCloseTo(8, 1)
    expect(e.einheit).toBe('m')
  })
  it('L-Form aus 6 Klicks: 6 Ecken, 1 Innenecke, zwei Teile bei Zerlegung', () => {
    const l: ZPunkt[] = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 6 }, { x: 8, z: 6 }, { x: 8, z: 14 }, { x: 0, z: 14 }]
    const e = ok(leseDxfUmriss(figurenZuDxf([l])))
    expect(e.form).toBe('l-form')
    expect(e.ecken).toBe(6)
    expect(e.innenecken).toBe(1)
    expect((e.teile ?? []).length).toBeGreaterThanOrEqual(2)
  })
  it('zwei getrennte Figuren: Haus 12×8 und Anbau 4×4 → 2 Teile', () => {
    const e = ok(leseDxfUmriss(figurenZuDxf([rechteck(0, 0, 12, 8), rechteck(14, 2, 4, 4)])))
    expect(e.teile).toHaveLength(2)
    const m = (e.teile ?? []).map((t) => [t.laengeM, t.tiefeM]).sort((a, b) => b[0] - a[0])
    expect(m[0][0]).toBeCloseTo(12, 0); expect(m[1][0]).toBeCloseTo(4, 0)
    // gleiche Folgekette wie bei der DXF: Teile → Abschnitte fürs Modell
    expect(abschnitteAusTeileListe(e.teile ?? []).length).toBe(2)
  })
  it('Uhrzeigersinn egal, Position weit weg vom Nullpunkt egal', () => {
    const r = rechteck(300, 500, 10, 6).reverse()
    const e = ok(leseDxfUmriss(figurenZuDxf([r])))
    expect(e.laengeM).toBeCloseTo(10, 1); expect(e.breiteM).toBeCloseTo(6, 1)
  })
})
