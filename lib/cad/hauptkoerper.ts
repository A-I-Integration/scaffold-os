// ============================================================
// SCAFFOLD OS – Hauptkörper einer Grundriss-Kontur: das größte Rechteck, das ganz in der Kontur liegt.
// Vorbauten (WC-Erker, Treppenhaus, Windfang) blähen sonst das umschließende Rechteck auf und aus einem
// 13,8 × 8,7 m Haus werden 13,8 × 10,3 m. Gilt nur, wenn das Rechteck den Großteil der Fläche trägt –
// sonst (L-Form, Winkelhaus) ist das umschließende Rechteck die ehrlichere Antwort und der Aufrufer bleibt dabei.
// ============================================================

import type { Pt } from './wand-kontur'

export interface Vorbau { laengeM: number; tiefeM: number; flaecheM2: number; /** umschließendes Rechteck in Seiten-Punkten (Koordinaten der Kontur) */ lage?: { x0: number; y0: number; x1: number; y1: number } }
/** Lage des Hauptkörper-Rechtecks in den Koordinaten der Kontur (Seiten-Punkte) */
export interface Rechteck { x0: number; y0: number; x1: number; y1: number }
export interface Hauptkoerper { laengeM: number; breiteM: number; flaecheM2: number; vorbauten: Vorbau[]; rechteck: Rechteck }

const ZELLE_M = 0.05
const MIN_ANTEIL = 0.85
const MIN_VORBAU_M2 = 1
const DUENN_M = 0.5

/** Morphologisches Öffnen mit k×k-Quadrat: behält nur Teile, in die ein k×k-Quadrat passt. */
function oeffnen(m: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const integral = new Int32Array((w + 1) * (h + 1))
  for (let r = 0; r < h; r++) { let zeile = 0; for (let q = 0; q < w; q++) { zeile += m[r * w + q]; integral[(r + 1) * (w + 1) + q + 1] = integral[r * (w + 1) + q + 1] + zeile } }
  const summe = (r0: number, q0: number, r1: number, q1: number) => integral[r1 * (w + 1) + q1] - integral[r0 * (w + 1) + q1] - integral[r1 * (w + 1) + q0] + integral[r0 * (w + 1) + q0]
  // Anker (r,q): Quadrat [r,r+k) × [q,q+k) komplett gefüllt
  const voll = new Uint8Array(w * h)
  for (let r = 0; r + k <= h; r++) for (let q = 0; q + k <= w; q++) if (summe(r, q, r + k, q + k) === k * k) voll[r * w + q] = 1
  // Dilatation: jede Zelle, die in einem vollen Quadrat liegt
  const aus = new Uint8Array(w * h)
  const diff = new Int32Array((w + 1) * (h + 1))
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) if (voll[r * w + q]) {
    diff[r * (w + 1) + q] += 1; diff[r * (w + 1) + Math.min(q + k, w)] -= 1
    diff[Math.min(r + k, h) * (w + 1) + q] -= 1; diff[Math.min(r + k, h) * (w + 1) + Math.min(q + k, w)] += 1
  }
  const acc = new Int32Array((w + 1) * (h + 1))
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    const v = diff[r * (w + 1) + q] + (r ? acc[(r - 1) * (w + 1) + q] : 0) + (q ? acc[r * (w + 1) + q - 1] : 0) - (r && q ? acc[(r - 1) * (w + 1) + q - 1] : 0)
    acc[r * (w + 1) + q] = v
    if (v > 0 && m[r * w + q]) aus[r * w + q] = 1
  }
  return aus
}

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

  // Rest = alles in der Kontur außerhalb des Rechtecks. Dünne Streifen (< 0,5 m, z. B. ein Wandversatz oder eine Putz-/Dämmstufe)
  // gehören zum Hauptkörper und verlängern ihn bis höchstens 0,5 m; dicke Teile (≥ 0,5 m, z. B. WC-Erker) sind Vorbauten.
  const rest = new Uint8Array(w * h)
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    const imRechteck = r >= best.r0 && r <= best.r1 && q >= best.q0 && q <= best.q1
    if (innen[r * w + q] && !imRechteck) rest[r * w + q] = 1
  }
  const k = Math.round(DUENN_M / ZELLE_M) // Kantenlänge des Prüfquadrats in Zellen
  const dick = oeffnen(rest, w, h, k)
  let ra0 = best.r0, ra1 = best.r1, qa0 = best.q0, qa1 = best.q1
  const MAX_EXT = k
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    const i = r * w + q
    if (!rest[i] || dick[i]) continue
    if (r < best.r0 && best.r0 - r <= MAX_EXT) ra0 = Math.min(ra0, r)
    if (r > best.r1 && r - best.r1 <= MAX_EXT) ra1 = Math.max(ra1, r)
    if (q < best.q0 && best.q0 - q <= MAX_EXT) qa0 = Math.min(qa0, q)
    if (q > best.q1 && q - best.q1 <= MAX_EXT) qa1 = Math.max(qa1, q)
  }
  // Zellen, die nach der Verlängerung im Hauptkörper liegen, zählen nicht mehr als Vorbau (nur der Teil darüber hinaus)
  for (let r = ra0; r <= ra1; r++) for (let q = qa0; q <= qa1; q++) dick[r * w + q] = 0
  const vorbauten: Vorbau[] = []
  const gesehen = new Uint8Array(w * h)
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!dick[s0] || gesehen[s0]) continue
    const fifo = [s0]; gesehen[s0] = 1
    let n = 0, qa = w, qb = 0, ra = h, rb = 0
    for (let i = 0; i < fifo.length; i++) {
      const p0 = fifo[i], r = Math.floor(p0 / w), q = p0 % w
      n++; qa = Math.min(qa, q); qb = Math.max(qb, q); ra = Math.min(ra, r); rb = Math.max(rb, r)
      for (const [dr, dq] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r2 = r + dr, q2 = q + dq
        if (r2 < 0 || q2 < 0 || r2 >= h || q2 >= w) continue
        const p2 = r2 * w + q2
        if (dick[p2] && !gesehen[p2]) { gesehen[p2] = 1; fifo.push(p2) }
      }
    }
    const flaeche = n * ZELLE_M * ZELLE_M
    if (flaeche < MIN_VORBAU_M2) continue
    const a = (qb - qa + 1) * ZELLE_M, b = (rb - ra + 1) * ZELLE_M
    vorbauten.push({ laengeM: Math.round(Math.max(a, b) * 100) / 100, tiefeM: Math.round(Math.min(a, b) * 100) / 100, flaecheM2: Math.round(flaeche * 10) / 10, lage: { x0: x0 + qa * c, y0: y0 + ra * c, x1: x0 + (qb + 1) * c, y1: y0 + (rb + 1) * c } })
  }
  const rb = (ra1 - ra0 + 1) * ZELLE_M, rl = (qa1 - qa0 + 1) * ZELLE_M
  return {
    laengeM: Math.round(Math.max(rb, rl) * 100) / 100,
    breiteM: Math.round(Math.min(rb, rl) * 100) / 100,
    flaecheM2: Math.round(best.a * ZELLE_M * ZELLE_M * 10) / 10,
    vorbauten,
    rechteck: { x0: x0 + qa0 * c, y0: y0 + ra0 * c, x1: x0 + (qa1 + 1) * c, y1: y0 + (ra1 + 1) * c },
  }
}
