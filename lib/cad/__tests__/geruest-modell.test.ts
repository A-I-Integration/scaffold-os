import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { dreieckeAusObj } from '../modell-import'
import { erkenneSchaftImGeruest, findeGeruestLagen } from '../geruest-modell'
import { analysiereDreiecke, abschnitteAusTeilen } from '../modell-analyse'
import { generateCADModel, type BuildingParams } from '../../calculations/cad-engine'

// Synthetisches Modell wie die Wuppertaler NWD: Turmschaft mit Flachdach, ein angebautes Gebäude und ein Gerüst
// (Beläge im 2-m-Abstand mit vielen kleinen Dreiecken, Stiele, Geländer) um den Turm.
type V = [number, number, number]
const tri = (a: V, b: V, c: V): number[] => [...a, ...b, ...c]

function quad(a: V, b: V, c: V, d: V, teile = 1): number[][] {
  const out: number[][] = []
  for (let i = 0; i < teile; i++) for (let j = 0; j < teile; j++) {
    const p = (u: number, v: number): V => {
      const e0: V = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
      const e1: V = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u, d[2] + (c[2] - d[2]) * u]
      return [e0[0] + (e1[0] - e0[0]) * v, e0[1] + (e1[1] - e0[1]) * v, e0[2] + (e1[2] - e0[2]) * v]
    }
    const u0 = i / teile, u1 = (i + 1) / teile, v0 = j / teile, v1 = (j + 1) / teile
    out.push(tri(p(u0, v0), p(u1, v0), p(u1, v1)), tri(p(u0, v0), p(u1, v1), p(u0, v1)))
  }
  return out
}

function box(x0: number, y0: number, x1: number, y1: number, h0: number, h1: number, dach = true): number[][] {
  const t: number[][] = []
  t.push(...quad([x0, y0, h0], [x1, y0, h0], [x1, y0, h1], [x0, y0, h1], 4))
  t.push(...quad([x0, y1, h0], [x1, y1, h0], [x1, y1, h1], [x0, y1, h1], 4))
  t.push(...quad([x0, y0, h0], [x0, y1, h0], [x0, y1, h1], [x0, y0, h1], 4))
  t.push(...quad([x1, y0, h0], [x1, y1, h0], [x1, y1, h1], [x1, y0, h1], 4))
  if (dach) t.push(...quad([x0, y0, h1], [x1, y0, h1], [x1, y1, h1], [x0, y1, h1], 1))
  return t
}

/** Gerüst um den Turm: Belagring je Lage (viele kleine waagrechte Dreiecke) + dünne Stiele */
function geruest(x0: number, y0: number, x1: number, y1: number, hoch: number): number[][] {
  const t: number[][] = []
  for (let h = 2; h <= hoch; h += 2) {
    // Ring 1 m breit um den Turm: vier Streifen, fein unterteilt (je Streifen 60 × 2 Quadrate)
    const r = 1
    t.push(...quad([x0 - r, y0 - r, h], [x1 + r, y0 - r, h], [x1 + r, y0, h], [x0 - r, y0, h], 30))
    t.push(...quad([x0 - r, y1, h], [x1 + r, y1, h], [x1 + r, y1 + r, h], [x0 - r, y1 + r, h], 30))
    t.push(...quad([x0 - r, y0, h], [x0, y0, h], [x0, y1, h], [x0 - r, y1, h], 30))
    t.push(...quad([x1, y0, h], [x1 + r, y0, h], [x1 + r, y1, h], [x1, y1, h], 30))
  }
  // Stiele (dünn, hoch)
  for (let x = x0 - 1; x <= x1 + 1; x += 3) for (const y of [y0 - 1, y1 + 1]) {
    t.push(tri([x, y, 0], [x + 0.05, y, 0], [x, y, hoch + 2]), tri([x + 0.05, y, 0], [x + 0.05, y, hoch + 2], [x, y, hoch + 2]))
  }
  return t
}

function drehe(tris: number[][], grad: number): number[][] {
  const c = Math.cos((grad * Math.PI) / 180), s = Math.sin((grad * Math.PI) / 180)
  return tris.map((t) => [t[0] * c - t[1] * s, t[0] * s + t[1] * c, t[2], t[3] * c - t[4] * s, t[3] * s + t[4] * c, t[5], t[6] * c - t[7] * s, t[6] * s + t[7] * c, t[8]])
}

const alsFloat = (tris: number[][]): Float32Array => new Float32Array(tris.flat())

// Turm 9 × 7 m, 31 m hoch, Anbau 21 × 5 m hoch 12 m, Gerüst bis 30 m
const turm = () => box(0, 0, 9, 7, 0, 31)
const anbau = () => box(-6, 7, 15, 12, 0, 12)

describe('Gerüst im Modell erkennen', () => {
  it('findet die Gerüstlagen im 2-m-Abstand', () => {
    const l = findeGeruestLagen(geruest(0, 0, 9, 7, 30).map((t) => t))
    expect(l).not.toBeNull()
    expect(l!.abstandM).toBeCloseTo(2, 1)
    expect(l!.lagenM.length).toBe(15)
  })
  it('ein Gebäude ohne Gerüst wird nicht verändert', () => {
    expect(findeGeruestLagen([...turm(), ...anbau()])).toBeNull()
    expect(erkenneSchaftImGeruest([...turm(), ...anbau()])).toBeNull()
  })
});

describe('Turmschaft in Modell mit Gerüst', () => {
  for (const grad of [0, 25]) {
    it(`liest Turm 9 × 7 × 31 m statt Gerüst-Fragmente (Drehung ${grad}°)`, () => {
      const modell = drehe([...turm(), ...anbau(), ...geruest(0, 0, 9, 7, 30)], grad)
      const a = analysiereDreiecke(alsFloat(modell), { format: 'obj', einheit: 'm', oben: 'z', quelle: 'nwd' })!
      expect(a.teile.length).toBe(1)
      const t = a.teile[0]
      expect(t.typ).toBe('turm')
      expect(t.dachForm).toBe('flachdach')
      expect(t.hoeheM).toBeCloseTo(31, 1)
      expect(Math.max(t.laengeM, t.tiefeM)).toBeCloseTo(9, 1)
      expect(Math.min(t.laengeM, t.tiefeM)).toBeCloseTo(7, 1)
      expect(a.hinweise.some((h) => h.includes('Gerüst im Modell erkannt'))).toBe(true)
      expect(a.ergebnis.mehrteilig).toBe(true) // sonst bietet die Oberfläche die Teile nicht zur Übernahme an
    })
  }
  it('der erkannte Turm lässt sich einrüsten, „Wand verdeckt bis Höhe“ wirkt auch bei einem einzigen Abschnitt', () => {
    const modell = [...turm(), ...anbau(), ...geruest(0, 0, 9, 7, 30)]
    const a = analysiereDreiecke(alsFloat(modell), { format: 'obj', einheit: 'm', oben: 'z', quelle: 'nwd' })!
    const sections = abschnitteAusTeilen(a)
    expect(sections.length).toBe(1)
    const b = (ab?: Record<string, number>): BuildingParams => ({
      lengthM: a.ergebnis.laengeM, widthM: a.ergebnis.tiefeMaxM, heightM: a.ergebnis.gesamtHoeheM, eavesHeightM: a.ergebnis.gesamtHoeheM, roofHeightM: 0, roofForm: 'flachdach',
      floors: 10, floorHeightsM: Array(10).fill(3.1), windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0,
      sides: ['front', 'back', 'left', 'right'], sections: [{ ...sections[0], ...(ab ? { geruestAbHoeheM: ab } : {}) }],
    })
    const ohne = generateCADModel(b(), 'layher-allround')
    const mit = generateCADModel(b({ right: 17 }), 'layher-allround')
    expect(ohne.fields.length).toBeGreaterThan(0)
    expect(mit.totalAreaM2).toBeLessThan(ohne.totalAreaM2 - 7 * 10)
  })
  it('ein Turm mit Spitzdach und Gerüst: kein falscher Schaft aus den Belägen', () => {
    // Pyramidendach statt Flachdach: keine große waagrechte Fläche oberhalb/außerhalb der Gerüstlagen
    const spitz = box(0, 0, 9, 7, 0, 31, false)
    for (const [a, b] of [[[0, 0], [9, 0]], [[9, 0], [9, 7]], [[9, 7], [0, 7]], [[0, 7], [0, 0]]] as [number, number][][]) {
      spitz.push(tri([a[0], a[1], 31], [b[0], b[1], 31], [4.5, 3.5, 40]))
    }
    expect(erkenneSchaftImGeruest([...spitz, ...geruest(0, 0, 9, 7, 30)])).toBeNull()
  })
})

// Echte Datei (Wuppertal, NWD → OBJ, zu groß fürs Repo): nur mit NWD_KIRCHTURM_OBJ=<Pfad> (OBJ, Z oben, Meter).
// Sollwerte stammen aus der Vermessung der Datei: Schaft 9,14 × 9,18 m; Höhe 31,0 m über Ursprung
// (31,2 m über der tiefsten Stelle des Modells, die 0,2 m unter dem Ursprung liegt).
const echt = process.env.NWD_KIRCHTURM_OBJ
describe.skipIf(!echt || !existsSync(echt))('Wuppertal Kirchturm (echte Datei)', () => {
  it('liest einen Turmschaft statt Fragmenten', () => {
    const d = dreieckeAusObj(readFileSync(echt!, 'utf8'))
    const a = analysiereDreiecke(d, { format: 'obj', einheit: 'm', oben: 'z', quelle: 'nwd' })!
    expect(a.teile.length).toBe(1)
    expect(a.teile[0].laengeM).toBeCloseTo(9.14, 1)
    expect(a.teile[0].tiefeM).toBeCloseTo(9.18, 1)
    expect(a.teile[0].hoeheM).toBeGreaterThan(30.9)
    expect(a.teile[0].hoeheM).toBeLessThan(31.5)
  })
})
