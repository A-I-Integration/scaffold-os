import { describe, it, expect } from 'vitest'
import { geruestMaske, ansichtsDaten } from '../geruest-entfernen'

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

const turm = () => box(0, 0, 9, 7, 0, 31)
// Querbau 21 × 5 m mit Satteldach an der +y-Wand des Turms (First läuft auf den Turm zu), wie im Wuppertaler Modell
const anbau = (): number[][] => {
  const t = box(-6, 7, 15, 12, 0, 12, false)
  t.push(...quad([-6, 7, 12], [4.5, 7, 22], [4.5, 12, 22], [-6, 12, 12], 1))
  t.push(...quad([15, 7, 12], [4.5, 7, 22], [4.5, 12, 22], [15, 12, 12], 1))
  return t
}

describe('Gerüst beim Anzeigen entfernen', () => {
  it('entfernt Gerüst, behält Turm und Anbau (auch gedreht)', () => {
    for (const grad of [0, 25]) {
      const bau = drehe([...turm(), ...anbau()], grad), ger = drehe(geruest(0, 0, 9, 7, 30), grad)
      const m = geruestMaske(alsFloat([...bau, ...ger]), { einheit: 'm', oben: 'z' })!
      expect(m).not.toBeNull()
      expect(m.behalten.slice(0, bau.length).every((b) => b === 1)).toBe(true)
      const entfernt = Array.from(m.behalten.slice(bau.length)).filter((b) => b === 0).length
      // Der Teil des Testgerüsts, der im Anbau steckt, liegt im Gebäudeumriss und bleibt (im echten Modell steht dort kein Gerüst)
      expect(entfernt / ger.length).toBeGreaterThan(0.7)
      expect(m.entfernt + Array.from(m.behalten).filter((b) => b === 1).length).toBe(m.gesamt)
    }
  })
  it('Anker: Schaftmitte, Längsachse auf +x, Ziel wie in unseren Abschnitten', () => {
    for (const grad of [0, 25]) {
      const m = geruestMaske(alsFloat(drehe([...turm(), ...anbau(), ...geruest(0, 0, 9, 7, 30)], grad)), { einheit: 'm', oben: 'z' })!
      // Turm 9 × 7 m, Anbau 21 m lang → Gesamtlänge 9 + 21 (Anbau liegt auf der Schaftseite, Länge je nach Erkennung)
      const c = Math.cos((grad * Math.PI) / 180), s = Math.sin((grad * Math.PI) / 180)
      expect(m.anker.wx).toBeCloseTo(4.5 * c - 3.5 * s, 1)
      expect(m.anker.wz).toBeCloseTo(-(4.5 * s + 3.5 * c), 1) // Welt-z = −y bei „Z oben“
      expect(Math.abs(m.anker.zielX)).toBeGreaterThan(0)
    }
  })
  it('ohne Gerüst im Modell wird nichts entfernt', () => {
    expect(geruestMaske(alsFloat([...turm(), ...anbau()]), { einheit: 'm', oben: 'z' })).toBeNull()
  })
  it('Ansicht: Farben nach Neigung, Anzahl passt zur Maske', () => {
    const d = alsFloat([...turm(), ...geruest(0, 0, 9, 7, 30)])
    const m = geruestMaske(d, { einheit: 'm', oben: 'z' })!
    const a = ansichtsDaten(d, m.behalten, 'z')
    expect(a.dreiecke).toBe(m.gesamt - m.entfernt)
    expect(a.positionen.length).toBe(a.dreiecke * 9)
    expect(a.farben.length).toBe(a.positionen.length)
  })
})
