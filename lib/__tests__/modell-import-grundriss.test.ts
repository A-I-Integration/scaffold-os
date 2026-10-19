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

import { dreieckeMitHoehe } from '../cad/modell-import'
import { erkenneBaukoerper, abschnitteAusBaukoerpern } from '../cad/baukoerper-erkennung'
import { generateCADModel } from '../calculations/cad-engine'

describe('OBJ (Kirche) → Gebäudeteile → Gerüst nur am Turm', () => {
  type P = [number, number, number]
  const t3 = (a: P, b: P, c: P) => [a, b, c]
  const q4 = (a: P, b: P, c: P, d: P) => [t3(a, b, c), t3(a, c, d)]
  const kasten = (x0: number, z0: number, x1: number, z1: number, h: number) => [
    ...q4([x0, z0, 0], [x1, z0, 0], [x1, z0, h], [x0, z0, h]), ...q4([x1, z0, 0], [x1, z1, 0], [x1, z1, h], [x1, z0, h]),
    ...q4([x1, z1, 0], [x0, z1, 0], [x0, z1, h], [x1, z1, h]), ...q4([x0, z1, 0], [x0, z0, 0], [x0, z0, h], [x0, z1, h]),
    ...q4([x0, z0, h], [x1, z0, h], [x1, z1, h], [x0, z1, h]),
  ]
  const pyr = (x0: number, z0: number, x1: number, z1: number, h: number, d: number) => { const sp: P = [(x0 + x1) / 2, (z0 + z1) / 2, h + d]; return [t3([x0, z0, h], [x1, z0, h], sp), t3([x1, z0, h], [x1, z1, h], sp), t3([x1, z1, h], [x0, z1, h], sp), t3([x0, z1, h], [x0, z0, h], sp)] }
  const sat = (x0: number, z0: number, x1: number, z1: number, h: number, d: number) => { const zm = (z0 + z1) / 2; return [...q4([x0, z0, h], [x1, z0, h], [x1, zm, h + d], [x0, zm, h + d]), ...q4([x0, zm, h + d], [x1, zm, h + d], [x1, z1, h], [x0, z1, h]), t3([x0, z0, h], [x0, zm, h + d], [x0, z1, h]), t3([x1, z0, h], [x1, z1, h], [x1, zm, h + d])] }
  /** Dreiecke → OBJ-Text (Z oben, App-z = −Y) */
  const alsObj = (tris: P[][]) => tris.map((t) => t.map((p) => `v ${p[0]} ${-p[1]} ${p[2]}`).join('\n')).join('\n') + '\n' + tris.map((_, i) => `f ${i * 3 + 1} ${i * 3 + 2} ${i * 3 + 3}`).join('\n')

  it('erkennt Turm (links) und Schiff und rüstet im CAD nur den Turm ein', () => {
    const obj = alsObj([...kasten(0, 1.5, 9, 10.5, 45), ...pyr(0, 1.5, 9, 10.5, 45, 13), ...kasten(9, 0, 39, 12, 12), ...sat(9, 0, 39, 12, 12, 8)])
    const e = erkenneBaukoerper(dreieckeMitHoehe(dreieckeAusObj(obj), 'm', 'z'))!
    expect(e.teile.length).toBe(2)
    expect(e.turmIndex).toBe(0) // Turm links, wie im Modell
    const b = { lengthM: e.laengeM, widthM: e.tiefeMaxM, heightM: e.gesamtHoeheM, eavesHeightM: 45, roofHeightM: 13, roofForm: 'flachdach' as const, floors: 12, floorHeightsM: Array(12).fill(3.75), windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front' as const, 'back' as const, 'left' as const, 'right' as const], sections: abschnitteAusBaukoerpern(e, true) }
    const m = generateCADModel(b, 'layher-allround')
    const maxX = Math.max(...m.fields.map((f) => f.positionX))
    expect(maxX).toBeLessThan(-9) // nur am Turm (links, Turmwand bei -10,5 + Gerüstabstand), nicht am Schiff
    expect(m.totalHeightM).toBeGreaterThan(55)
  })
})
