import { describe, expect, it } from 'vitest'
import { flaechenAusOperatoren, type PdfOps } from '../pdf-vektoren'

const OPS: PdfOps = {
  save: 10, restore: 11, transform: 12, constructPath: 13,
  fill: 20, eoFill: 21, fillStroke: 22, eoFillStroke: 23, closePath: 24,
  setFillRGBColor: 30, stroke: 25, closeStroke: 26, closeFillStroke: 27, closeEOFillStroke: 28, setStrokeRGBColor: 31,
}
// pdf.js 5.4: 0 moveTo, 1 lineTo, 2 curveTo, 3 closePath
const rechteck = (x0: number, y0: number, x1: number, y1: number) => new Float32Array([0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 3])
const IDENT = [1, 0, 0, 1, 0, 0]

describe('Vektorflächen aus pdf.js-Operatoren', () => {
  it('liest gefüllte Rechtecke mit Farbe und rechnet mit der Seitenmatrix', () => {
    const fn = [OPS.setFillRGBColor, OPS.constructPath]
    const args = [['#FF8000'], [OPS.fill, [rechteck(10, 20, 30, 24)], null]]
    const r = flaechenAusOperatoren(fn, args, OPS, [1, 0, 0, -1, 0, 100]) // y nach unten, Seitenhöhe 100
    expect(r).toHaveLength(1)
    expect(r[0].fill).toBe('#ff8000')
    expect(r[0].bbox).toEqual([10, 76, 30, 80])
  })

  it('schließender Pfadbefehl (3) verschluckt keine Folgekoordinaten: mehrere Teilpfade bleiben getrennt', () => {
    const zwei = new Float32Array([...rechteck(0, 0, 10, 4), ...rechteck(50, 0, 60, 4)])
    const r = flaechenAusOperatoren([OPS.constructPath], [[OPS.fill, [zwei], null]], OPS, IDENT)
    expect(r[0].ringe).toHaveLength(2)
    expect(r[0].bbox).toEqual([0, 0, 60, 4])
  })

  it('save/restore/transform: Matrix gilt nur innerhalb', () => {
    const fn = [OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.constructPath]
    const args = [null, [2, 0, 0, 2, 5, 5], [OPS.fill, [rechteck(0, 0, 1, 1)], null], null, [OPS.fill, [rechteck(0, 0, 1, 1)], null]]
    const r = flaechenAusOperatoren(fn, args, OPS, IDENT)
    expect(r[0].bbox).toEqual([5, 5, 7, 7])
    expect(r[1].bbox).toEqual([0, 0, 1, 1])
  })

  it('Linien (stroke) kommen mit Strichfarbe als Linienzug, ohne Fläche', () => {
    const linie = new Float32Array([0, 0, 0, 1, 10, 0])
    const r = flaechenAusOperatoren([OPS.setStrokeRGBColor, OPS.constructPath], [['#00ff00'], [OPS.stroke, [linie], null]], OPS, IDENT)
    expect(r).toHaveLength(1)
    expect(r[0].linie).toBe(true)
    expect(r[0].fill).toBe('#00ff00')
  })

  it('fillStroke liefert Fläche und Linie mit ihren Farben', () => {
    const fn = [OPS.setFillRGBColor, OPS.setStrokeRGBColor, OPS.constructPath]
    const args = [['#ff0000'], ['#0000ff'], [OPS.fillStroke, [rechteck(0, 0, 4, 4)], null]]
    const r = flaechenAusOperatoren(fn, args, OPS, IDENT)
    expect(r.map((x) => [x.fill, !!x.linie])).toEqual([['#ff0000', false], ['#0000ff', true]])
  })

  it('unbekannter Pfadbefehl bricht ab statt falsch weiterzulesen', () => {
    const kaputt = new Float32Array([0, 0, 0, 1, 5, 0, 9, 1, 2, 3, 4, 5])
    const r = flaechenAusOperatoren([OPS.constructPath], [[OPS.fill, [kaputt], null]], OPS, IDENT)
    expect(r.every((f) => f.ringe.every((ring) => ring.every((p) => p.every(Number.isFinite))))).toBe(true)
  })
})
