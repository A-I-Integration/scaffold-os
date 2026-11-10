// ============================================================
// SCAFFOLD OS – Hauptkörper einer Grundriss-Kontur: das größte Rechteck, das ganz in der Kontur liegt.
// Vorbauten (WC-Erker, Treppenhaus, Windfang) blähen sonst das umschließende Rechteck auf und aus einem
// 13,8 × 8,7 m Haus werden 13,8 × 10,3 m. Gilt nur, wenn das Rechteck den Großteil der Fläche trägt –
// sonst (L-Form, Winkelhaus) ist das umschließende Rechteck die ehrlichere Antwort und der Aufrufer bleibt dabei.
// ============================================================

import type { Pt } from './wand-kontur'

export interface Vorbau { laengeM: number; tiefeM: number; flaecheM2: number }
export interface Hauptkoerper { laengeM: number; breiteM: number; flaecheM2: number; vorbauten: Vorbau[] }

const ZELLE_M = 0.05
const MIN_ANTEIL = 0.85
const MIN_VORBAU_M2 = 1

const imPolygon = (k: Pt[], px: number, py: number) => {
  let inn = false
  for (let i = 0, j = k.length - 1; i < k.length; j = i++) {
    if ((k[i].y > py) !== (k[j].y > py) && px < ((k[j].x - k[i].x) * (py - k[i].y)) / (k[j].y - k[i].y) + k[i].x) inn = !inn
  }
  return inn
}

/** Hauptkörper + Vorbauten; null, wenn die Kontur kein Rechteck mit kleinen Vorsprüngen ist. */
export function hauptkoerperAusKontur(kontur: Pt[], meterJePunkt: number): Hauptkoerper | null {
  if (kontur.length < 4 || !(meterJePunkt > 0)) return null
  const c = ZELLE_M / meterJePunkt
  const x0 = Math.min(...kontur.map((p) => p.x)), x1 = Math.max(...kontur.map((p) => p.x))
  const y0 = Math.min(...kontur.map((p) => p.y)), y1 = Math.max(...kontur.map((p) => p.y))
  const w = Math.ceil((x1 - x0) / c), h = Math.ceil((y1 - y0) / c)
  if (w < 4 || h < 4 || w * h > 4_000_000) return null
  const innen = new Uint8Array(w * h)
  let anzahl = 0
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    if (imPolygon(kontur, x0 + (q + 0.5) * c, y0 + (r + 0.5) * c)) { innen[r * w + q] = 1; anzahl++ }
  }
  if (!anzahl) return null

  // größtes Rechteck aus lauter 1-Zellen (Histogramm-Verfahren)
  const hoehe = new Int32Array(w)
  let best = { a: 0, r0: 0, r1: 0, q0: 0, q1: 0 }
  for (let r = 0; r < h; r++) {
    for (let q = 0; q < w; q++) hoehe[q] = innen[r * w + q] ? hoehe[q] + 1 : 0
    const stapel: number[] = []
    for (let q = 0; q <= w; q++) {
      const hq = q === w ? 0 : hoehe[q]
      while (stapel.length && hoehe[stapel[stapel.length - 1]] >= hq) {
        const hh = hoehe[stapel.pop()!]
        const links = stapel.length ? stapel[stapel.length - 1] + 1 : 0
        const a = hh * (q - links)
        if (a > best.a) best = { a, r0: r - hh + 1, r1: r, q0: links, q1: q - 1 }
      }
      stapel.push(q)
    }
  }
  if (best.a / anzahl < MIN_ANTEIL) return null

  // Rest = Vorbauten (zusammenhängende Gruppen außerhalb des Rechtecks)
  const rest = new Uint8Array(w * h)
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    const imRechteck = r >= best.r0 && r <= best.r1 && q >= best.q0 && q <= best.q1
    if (innen[r * w + q] && !imRechteck) rest[r * w + q] = 1
  }
  const vorbauten: Vorbau[] = []
  const gesehen = new Uint8Array(w * h)
  for (let s = 0; s < w * h; s++) {
    if (!rest[s] || gesehen[s]) continue
    const fifo = [s]; gesehen[s] = 1
    let n = 0, qa = w, qb = 0, ra = h, rb = 0
    for (let i = 0; i < fifo.length; i++) {
      const p = fifo[i], r = Math.floor(p / w), q = p % w
      n++; qa = Math.min(qa, q); qb = Math.max(qb, q); ra = Math.min(ra, r); rb = Math.max(rb, r)
      for (const [dr, dq] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r2 = r + dr, q2 = q + dq
        if (r2 < 0 || q2 < 0 || r2 >= h || q2 >= w) continue
        const p2 = r2 * w + q2
        if (rest[p2] && !gesehen[p2]) { gesehen[p2] = 1; fifo.push(p2) }
      }
    }
    const flaeche = n * ZELLE_M * ZELLE_M
    if (flaeche < MIN_VORBAU_M2) continue
    const a = (qb - qa + 1) * ZELLE_M, b = (rb - ra + 1) * ZELLE_M
    vorbauten.push({ laengeM: Math.round(Math.max(a, b) * 100) / 100, tiefeM: Math.round(Math.min(a, b) * 100) / 100, flaecheM2: Math.round(flaeche * 10) / 10 })
  }
  const rb = (best.r1 - best.r0 + 1) * ZELLE_M, rl = (best.q1 - best.q0 + 1) * ZELLE_M
  return {
    laengeM: Math.round(Math.max(rb, rl) * 100) / 100,
    breiteM: Math.round(Math.min(rb, rl) * 100) / 100,
    flaecheM2: Math.round(best.a * ZELLE_M * ZELLE_M * 10) / 10,
    vorbauten,
  }
}
