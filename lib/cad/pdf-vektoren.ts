// ============================================================
// SCAFFOLD OS – Gefüllte Flächen aus den Zeichenbefehlen einer Vektor-PDF (pdf.js-Operatorliste).
// Pläne aus dem CAD enthalten Wände als echte Polygone mit Füllfarbe; daraus lässt sich die
// Außenkontur auf den Zentimeter berechnen, ohne dass eine KI messen muss (siehe wand-kontur.ts).
// Rein rechnerisch, ohne Browser: pdf.js liefert fnArray/argsArray, die Konstanten reichen wir herein.
// ============================================================

export interface VektorFlaeche {
  /** Farbe als '#rrggbb' (Füllfarbe bei Flächen, Strichfarbe bei Linien) */
  fill: string
  /** true: Linienzug (gezeichnet), false: gefüllte Fläche */
  linie?: boolean
  /** Teilpfade (Polygone) in Seiten-Punkten, y nach unten, Ursprung oben links */
  ringe: number[][][]
  bbox: [number, number, number, number]
}

/** Zeichenoperationen von pdf.js (OPS) – nur die, die wir brauchen. */
export interface PdfOps {
  save: number; restore: number; transform: number
  constructPath: number
  fill: number; eoFill: number; fillStroke: number; eoFillStroke: number; closePath: number
  setFillRGBColor: number
  stroke: number; closeStroke: number; closeFillStroke: number; closeEOFillStroke: number
  setStrokeRGBColor: number
}

type Matrix = [number, number, number, number, number, number]
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]

// DrawOPS von pdf.js 5 (pdfjs-dist 5.4): 0 moveTo, 1 lineTo, 2 curveTo (6 Zahlen), 3 closePath
const DRAW_MOVE = 0, DRAW_LINE = 1, DRAW_CURVE = 2, DRAW_CLOSE = 3

/**
 * @param seitenTransform pdf.js-viewport.transform (Nutzerraum → Seite, y nach unten, scale 1)
 */
export function flaechenAusOperatoren(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: PdfOps, seitenTransform: number[]): VektorFlaeche[] {
  const fuellOps = new Set([ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke])
  const strichOps = new Set([ops.stroke, ops.closeStroke, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke])
  let ctm: Matrix = [seitenTransform[0], seitenTransform[1], seitenTransform[2], seitenTransform[3], seitenTransform[4], seitenTransform[5]]
  const stack: Matrix[] = []
  let farbe = '#000000'
  let strichFarbe = '#000000'
  const out: VektorFlaeche[] = []

  for (let i = 0; i < fnArray.length; i++) {
    const f = fnArray[i]
    const a = argsArray[i] as unknown
    if (f === ops.save) stack.push(ctm)
    else if (f === ops.restore) { const m = stack.pop(); if (m) ctm = m }
    else if (f === ops.transform) { const t = a as number[]; if (t && t.length >= 6) ctm = mul(ctm, [t[0], t[1], t[2], t[3], t[4], t[5]]) }
    else if (f === ops.setFillRGBColor) { const c = (a as unknown[])?.[0]; if (typeof c === 'string') farbe = c.toLowerCase() }
    else if (f === ops.setStrokeRGBColor) { const c = (a as unknown[])?.[0]; if (typeof c === 'string') strichFarbe = c.toLowerCase() }
    else if (f === ops.constructPath) {
      const arg = a as [number, ArrayLike<number>[] | undefined, ArrayLike<number> | undefined]
      if (!arg || !(fuellOps.has(arg[0]) || strichOps.has(arg[0]))) continue
      const daten = arg[1]?.[0]
      if (!daten) continue
      const ringe: number[][][] = []
      let ring: number[][] = []
      const punkt = (x: number, y: number) => { ring.push([ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]) }
      const beenden = () => { if (ring.length >= 2) ringe.push(ring); ring = [] }
      for (let k = 0; k < daten.length;) {
        const op = daten[k]
        if (op === DRAW_MOVE) { beenden(); punkt(daten[k + 1], daten[k + 2]); k += 3 }
        else if (op === DRAW_LINE) { punkt(daten[k + 1], daten[k + 2]); k += 3 }
        else if (op === DRAW_CURVE) { punkt(daten[k + 5], daten[k + 6]); k += 7 } // Kurven: Endpunkt genügt für Wandflächen
        else if (op === DRAW_CLOSE) { k += 1 }
        else break // unbekannt: abbrechen statt falsch weiterzulesen
      }
      beenden()
      if (!ringe.length) continue
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const r of ringe) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      const bbox: [number, number, number, number] = [x0, y0, x1, y1]
      if (fuellOps.has(arg[0])) { const flaechen = ringe.filter((r) => r.length >= 3); if (flaechen.length) out.push({ fill: farbe, ringe: flaechen, bbox }) }
      if (strichOps.has(arg[0])) out.push({ fill: strichFarbe, linie: true, ringe, bbox })
    }
  }
  return out
}
