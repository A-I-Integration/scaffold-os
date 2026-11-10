import { describe, expect, it } from 'vitest'
import { aussenkontur, flaecheUnterKlick, type Pt } from '../wand-kontur'
import type { VektorFlaeche } from '../pdf-vektoren'

const rechteck = (x0: number, y0: number, x1: number, y1: number, fill = '#ff8000'): VektorFlaeche => ({
  fill, ringe: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]], bbox: [x0, y0, x1, y1],
})
const flaeche = (pts: number[][], fill = '#ff8000'): VektorFlaeche => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  return { fill, ringe: [pts], bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
}
const bbox = (k: Pt[]) => ({ x0: Math.min(...k.map((p) => p.x)), x1: Math.max(...k.map((p) => p.x)), y0: Math.min(...k.map((p) => p.y)), y1: Math.max(...k.map((p) => p.y)) })

/** Wandring als vier Streifen (Wandstärke t), links oben (x0,y0), mit einer Türlücke in der unteren Wand. */
function ring(x0: number, y0: number, x1: number, y1: number, t: number, tuer?: [number, number]): VektorFlaeche[] {
  const unten: VektorFlaeche[] = tuer
    ? [rechteck(x0, y1 - t, tuer[0], y1), rechteck(tuer[1], y1 - t, x1, y1)]
    : [rechteck(x0, y1 - t, x1, y1)]
  return [rechteck(x0, y0, x1, y0 + t), rechteck(x0, y0, x0 + t, y1), rechteck(x1 - t, y0, x1, y1), ...unten]
}

describe('Wand-Kontur aus Vektorflächen', () => {
  it('Rechteck mit Türlücke: 4 Ecken, Maße stimmen auf den Punkt', () => {
    const fl = ring(100, 200, 500, 500, 8, [200, 235])
    const r = aussenkontur(fl, { x: 104, y: 300 })
    expect(r).not.toBeNull()
    expect(r!.kontur).toHaveLength(4)
    const b = bbox(r!.kontur)
    expect(b.x1 - b.x0).toBeCloseTo(400, 0)
    expect(b.y1 - b.y0).toBeCloseTo(300, 0)
  })

  it('L-förmiger Grundriss: 6 Ecken', () => {
    // L = Rechteck 400x300 minus Ecke oben rechts 150x100
    const aussen = [[100, 200], [350, 200], [350, 300], [500, 300], [500, 500], [100, 500]]
    const t = 8
    const wand = (a: number[], b: number[]) => {
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1])
      return x0 === x1 ? rechteck(x0, y0, x0 + t, y1) : rechteck(x0, y0, x1, y0 + t)
    }
    const fl = [wand(aussen[0], aussen[1]), wand(aussen[1], aussen[2]), wand(aussen[2], aussen[3]), wand(aussen[3], aussen[4]), wand(aussen[4], aussen[5]), wand(aussen[5], aussen[0])]
    const r = aussenkontur(fl, { x: 104, y: 300 })
    expect(r).not.toBeNull()
    expect(r!.kontur.length).toBeGreaterThanOrEqual(6)
    expect(r!.kontur.length).toBeLessThanOrEqual(8)
    const b = bbox(r!.kontur)
    // die Streifen liegen auf den Eckpunkten und ragen um die Wandstärke 8 nach rechts bzw. unten
    expect(b.x1 - b.x0).toBeCloseTo(408, 0)
    expect(b.y1 - b.y0).toBeCloseTo(308, 0)
  })

  it('andere Farben und ein zweiter, weit entfernter Grundriss stören nicht', () => {
    const fl = [...ring(100, 200, 500, 500, 8, [200, 235]), rechteck(150, 250, 450, 258, '#808080'), ...ring(1500, 200, 1700, 400, 8)]
    const r = aussenkontur(fl, { x: 104, y: 300 })
    const b = bbox(r!.kontur)
    expect(b.x1 - b.x0).toBeCloseTo(400, 0)
    expect(r!.anzahlFlaechen).toBe(5)
  })

  it('Klick ins Leere liefert null', () => {
    const fl = ring(100, 200, 500, 500, 8)
    expect(aussenkontur(fl, { x: 300, y: 350 })).toBeNull()
    expect(flaecheUnterKlick(fl, { x: 300, y: 350 })).toBeNull()
  })

  it('weiße Flächen zählen nicht als Wand', () => {
    expect(aussenkontur([rechteck(0, 0, 100, 100, '#ffffff')], { x: 50, y: 50 })).toBeNull()
  })

  it('Fläche mit mehreren Ecken (Polygon) wird erkannt', () => {
    const fl = [flaeche([[0, 0], [100, 0], [100, 8], [0, 8]])]
    expect(flaecheUnterKlick(fl, { x: 50, y: 4 })).not.toBeNull()
  })
})
