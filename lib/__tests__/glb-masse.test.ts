import { describe, it, expect } from 'vitest'
import { masseAusDreiecken } from '@/lib/cad/glb-masse'

type V = [number, number, number]
const tri = (out: number[], a: V, b: V, c: V) => out.push(...a, ...b, ...c)
const quad = (out: number[], a: V, b: V, c: V, d: V) => { tri(out, a, b, c); tri(out, a, c, d) }

/** Haus: Wände L×B bis Traufe, Satteldach (First entlang X) mit Überstand, optional Schornstein */
function haus(L = 12, B = 9, traufe = 6, rise = 3.4, ueber = 0.4, schornstein = true): Float32Array {
  const o: number[] = []
  const x0 = -L / 2, x1 = L / 2, z0 = -B / 2, z1 = B / 2
  quad(o, [x0, 0, z0], [x1, 0, z0], [x1, traufe, z0], [x0, traufe, z0])
  quad(o, [x0, 0, z1], [x1, 0, z1], [x1, traufe, z1], [x0, traufe, z1])
  quad(o, [x0, 0, z0], [x0, 0, z1], [x0, traufe, z1], [x0, traufe, z0])
  quad(o, [x1, 0, z0], [x1, 0, z1], [x1, traufe, z1], [x1, traufe, z0])
  // Dachflächen (je ein Viereck = zwei große Dreiecke, Eckpunkte nur an Traufe und First)
  const zt = z1 + ueber, xt = x1 + ueber
  quad(o, [-xt, traufe, -zt], [xt, traufe, -zt], [xt, traufe + rise, 0], [-xt, traufe + rise, 0])
  quad(o, [-xt, traufe, zt], [xt, traufe, zt], [xt, traufe + rise, 0], [-xt, traufe + rise, 0])
  if (schornstein) quad(o, [1, traufe + rise, 0], [1.9, traufe + rise, 0], [1.9, traufe + rise + 0.45, 0], [1, traufe + rise + 0.45, 0])
  return Float32Array.from(o)
}

describe('masseAusDreiecken', () => {
  it('Satteldach mit Überstand und Schornstein: Traufe an der Dachkante, First ohne Schornstein', () => {
    const m = masseAusDreiecken(haus())!
    expect(m.roofForm).toBe('satteldach')
    expect(m.eavesHeightM).toBeGreaterThan(5.7); expect(m.eavesHeightM).toBeLessThan(6.4)
    expect(m.heightM).toBeGreaterThan(9.2); expect(m.heightM).toBeLessThan(9.6) // First 9,4 – nicht 9,85 mit Schornstein
    expect(m.lengthM).toBeCloseTo(12, 0); expect(m.widthM).toBeCloseTo(9, 0); expect(m.drehen90).toBe(false)
  })
  it('lange Seite in Z → drehen90', () => {
    const d = haus(); for (let i = 0; i < d.length; i += 3) { const x = d[i]; d[i] = d[i + 2]; d[i + 2] = x }
    expect(masseAusDreiecken(d)!.drehen90).toBe(true)
  })
  it('Flachdach-Quader', () => {
    const o: number[] = []
    quad(o, [0, 0, 0], [8, 0, 0], [8, 6, 0], [0, 6, 0]); quad(o, [0, 0, 6], [8, 0, 6], [8, 6, 6], [0, 6, 6])
    quad(o, [0, 0, 0], [0, 0, 6], [0, 6, 6], [0, 6, 0]); quad(o, [8, 0, 0], [8, 0, 6], [8, 6, 6], [8, 6, 0])
    const m = masseAusDreiecken(Float32Array.from(o))!
    expect(m.roofForm).toBe('flachdach'); expect(m.roofHeightM).toBe(0); expect(m.eavesHeightM).toBeGreaterThan(5.7)
  })
})
