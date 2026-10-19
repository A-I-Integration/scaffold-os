import { describe, it, expect } from 'vitest'
import { dreieckeAusObj, dreieckeAusStl, draufsichtDreiecke } from '../cad/modell-import'
import { erkenneGrundriss } from '../cad/grundriss-erkennung'

/** OBJ eines Quaders (Z oben) – nur Wände und Dach, wie ein SketchUp-Export. */
function quaderObj(x0: number, y0: number, x1: number, y1: number, h: number, offset: number): string {
  const v = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]]
  const o = offset
  const f = [[1, 2, 6, 5], [2, 3, 7, 6], [3, 4, 8, 7], [4, 1, 5, 8], [5, 6, 7, 8]]
  return v.map((p) => `v ${p.join(' ')}`).join('\n') + '\n' + f.map((q) => `f ${q.map((i) => i + o).join(' ')}`).join('\n') + '\n'
}

describe('OBJ/STL → Grundriss', () => {
  it('L-förmiges Haus aus zwei Quadern (OBJ) wird als L-Form erkannt', () => {
    const obj = quaderObj(0, 0, 14, 6, 8, 0) + quaderObj(0, 6, 6, 12, 8, 8)
    const dr = draufsichtDreiecke(dreieckeAusObj(obj), 'm', 'z')
    const e = erkenneGrundriss({ dreiecke: dr })
    expect(e?.form).toBe('l-form')
    expect(e?.ecken).toBe(6)
  })
  it('Einheit Zentimeter wird umgerechnet', () => {
    const obj = quaderObj(0, 0, 1200, 800, 800, 0)
    const e = erkenneGrundriss({ dreiecke: draufsichtDreiecke(dreieckeAusObj(obj), 'cm', 'z') })
    expect(e?.form).toBe('rechteck')
    expect(e?.laengeM).toBeCloseTo(12, 0)
  })
  it('Y oben: die Draufsicht nimmt X und Z', () => {
    // Quader mit Y als Höhe: 12 (x) × 8 (z) × 5 (y)
    const v = [[0, 0, 0], [12, 0, 0], [12, 0, 8], [0, 0, 8], [0, 5, 0], [12, 5, 0], [12, 5, 8], [0, 5, 8]]
    const f = [[1, 2, 6, 5], [2, 3, 7, 6], [3, 4, 8, 7], [4, 1, 5, 8], [5, 6, 7, 8], [1, 2, 3, 4]]
    const obj = v.map((p) => `v ${p.join(' ')}`).join('\n') + '\n' + f.map((q) => `f ${q.join(' ')}`).join('\n')
    const e = erkenneGrundriss({ dreiecke: draufsichtDreiecke(dreieckeAusObj(obj), 'm', 'y') })
    expect(e?.form).toBe('rechteck')
    expect(e?.laengeM).toBeCloseTo(12, 0)
    expect(e?.breiteM).toBeCloseTo(8, 0)
  })
  it('ASCII-STL wird gelesen', () => {
    const tri = 'facet normal 0 0 1\nouter loop\nvertex 0 0 5\nvertex 10 0 5\nvertex 10 6 5\nendloop\nendfacet\nfacet normal 0 0 1\nouter loop\nvertex 0 0 5\nvertex 10 6 5\nvertex 0 6 5\nendloop\nendfacet\n'
    const dr = dreieckeAusStl(new TextEncoder().encode('solid x\n' + tri + 'endsolid').buffer as ArrayBuffer)
    expect(dr.length).toBe(18)
    expect(erkenneGrundriss({ dreiecke: draufsichtDreiecke(dr, 'm', 'z') })?.form).toBe('rechteck')
  })
})
