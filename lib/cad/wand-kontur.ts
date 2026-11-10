// ============================================================
// SCAFFOLD OS – Außenkontur eines Gebäudes aus den gefüllten Wandflächen einer Vektor-PDF.
// Ablauf: Fläche unter dem Klick → Farbe → alle gleichfarbigen Flächen in der Nähe (ein Grundriss)
// → Raster → Türen/Fenster-Lücken schließen → Innenräume füllen → Rand nachfahren → Ecken vereinfachen.
// Alle Längen in PDF-Punkten (Seitenkoordinaten, y nach unten).
// ============================================================

import type { VektorFlaeche } from './pdf-vektoren'

export type Pt = { x: number; y: number }

export interface KonturOptionen {
  /** Größter Abstand zwischen zwei Wandstücken, die noch zum selben Grundriss zählen */
  clusterAbstand?: number
  /** Rasterzelle in Punkten */
  zelle?: number
  /** Lücken (Türen, Fenster) bis zu dieser Breite werden geschlossen */
  schliessen?: number
  /** Vereinfachungs-Toleranz in Punkten */
  toleranz?: number
  /** Nur Teile in diesem Umkreis um den Klick (Punkte) – verhindert, dass ganze Pläne zusammenwachsen */
  maxRadius?: number
  /** Klick knapp neben einer Fläche: Reichweite in Punkten, in der die nächste Fläche noch gilt */
  fangRadius?: number
}

const STANDARD = { clusterAbstand: 45, zelle: 1, schliessen: 40, toleranz: 1.6, maxRadius: 700, fangRadius: 0 }

function istWeiss(hex: string) { return hex === '#ffffff' }

/** Ein einzelner Teilpfad. Ein Zeichenbefehl kann viele Teilpfade enthalten (z. B. alle Wände eines Geschosses). */
interface Teil { fill: string; linie: boolean; ring: number[][]; bbox: [number, number, number, number]; ordnung: number }

function zuTeilen(fl: VektorFlaeche[]): Teil[] {
  const out: Teil[] = []
  let ordnung = 0
  for (const f of fl) {
    ordnung++
    for (const ring of f.ringe) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      out.push({ fill: f.fill, linie: !!f.linie, ring, bbox: [x0, y0, x1, y1], ordnung })
    }
  }
  return out
}

function imRing(ring: number[][], p: Pt): boolean {
  let innen = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) innen = !innen
  }
  return innen
}

/** Abstand eines Punktes zu einem Linienzug */
function abstandLinie(ring: number[][], p: Pt): number {
  let best = Infinity
  for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1]
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2)) : 0
    best = Math.min(best, Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)))
  }
  return best
}

/**
 * Was der Nutzer an der Klickstelle sieht: der zuletzt gezeichnete Teil, der den Punkt trifft.
 * Ist das eine weiße Fläche (Abdeckung), gibt es dort keine Wand.
 */
function teilUnterKlick(teile: Teil[], p: Pt, toleranz = 1.2, fangRadius = 0): Teil | null {
  let oben: Teil | null = null
  for (const t of teile) {
    if (oben && t.ordnung < oben.ordnung) continue
    const [x0, y0, x1, y1] = t.bbox
    if (p.x < x0 - toleranz || p.x > x1 + toleranz || p.y < y0 - toleranz || p.y > y1 + toleranz) continue
    const trifft = t.linie ? abstandLinie(t.ring, p) <= toleranz : imRing(t.ring, p)
    if (trifft) oben = t
  }
  if (oben) return istWeiss(oben.fill) ? null : oben
  // Knapp daneben: die nächste gefüllte, nicht weiße Fläche in Reichweite (Wände sind auf dem Bildschirm oft nur wenige Pixel breit)
  let nah: Teil | null = null, nahD = fangRadius
  for (const t of teile) {
    if (t.linie || istWeiss(t.fill)) continue
    const [x0, y0, x1, y1] = t.bbox
    if (p.x < x0 - fangRadius || p.x > x1 + fangRadius || p.y < y0 - fangRadius || p.y > y1 + fangRadius) continue
    const d = abstandLinie([...t.ring, t.ring[0]], p)
    if (d <= nahD) { nah = t; nahD = d }
  }
  return nah
}

/** Gibt es unter dem Klick eine gefüllte, nicht weiße Fläche? (Für Hinweise in der Oberfläche) */
export function flaecheUnterKlick(fl: VektorFlaeche[], p: Pt, toleranz = 1.2): string | null {
  return teilUnterKlick(zuTeilen(fl), p, toleranz)?.fill ?? null
}

function luecke(a: Teil['bbox'], b: Teil['bbox']): number {
  const dx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]))
  const dy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]))
  return Math.hypot(dx, dy)
}

/** Alle gleichfarbigen Teilpfade, die über Lücken ≤ abstand mit dem Startstück zusammenhängen (mit Gitter-Index). */
function wandCluster(teile: Teil[], start: Teil, abstand: number, mitte: Pt, radius: number): Teil[] {
  const imKreis = (t: Teil) => t.bbox[2] >= mitte.x - radius && t.bbox[0] <= mitte.x + radius && t.bbox[3] >= mitte.y - radius && t.bbox[1] <= mitte.y + radius
  const gleich = teile.filter((t) => t.fill === start.fill && t.linie === start.linie && imKreis(t) && Math.max(t.bbox[2] - t.bbox[0], t.bbox[3] - t.bbox[1]) <= radius)
  const zelle = Math.max(abstand, 1)
  const index = new Map<string, Teil[]>()
  const schluessel = (cx: number, cy: number) => cx + ',' + cy
  for (const t of gleich) {
    for (let cx = Math.floor(t.bbox[0] / zelle); cx <= Math.floor(t.bbox[2] / zelle); cx++) {
      for (let cy = Math.floor(t.bbox[1] / zelle); cy <= Math.floor(t.bbox[3] / zelle); cy++) {
        const k = schluessel(cx, cy); const l = index.get(k); if (l) l.push(t); else index.set(k, [t])
      }
    }
  }
  const drin = new Set<Teil>([start])
  const warte: Teil[] = [start]
  while (warte.length) {
    const a = warte.pop()!
    for (let cx = Math.floor((a.bbox[0] - abstand) / zelle); cx <= Math.floor((a.bbox[2] + abstand) / zelle); cx++) {
      for (let cy = Math.floor((a.bbox[1] - abstand) / zelle); cy <= Math.floor((a.bbox[3] + abstand) / zelle); cy++) {
        for (const b of index.get(schluessel(cx, cy)) ?? []) {
          if (!drin.has(b) && luecke(a.bbox, b.bbox) <= abstand) { drin.add(b); warte.push(b) }
        }
      }
    }
  }
  return [...drin]
}

function rastere(cluster: Teil[], zelle: number, rand: number) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const t of cluster) { x0 = Math.min(x0, t.bbox[0]); y0 = Math.min(y0, t.bbox[1]); x1 = Math.max(x1, t.bbox[2]); y1 = Math.max(y1, t.bbox[3]) }
  x0 -= rand; y0 -= rand; x1 += rand; y1 += rand
  const w = Math.ceil((x1 - x0) / zelle), h = Math.ceil((y1 - y0) / zelle)
  const m = new Uint8Array(w * h)
  // je Teilpfad scannen und füllen (gerade-ungerade über den Teilpfad selbst)
  for (const t of cluster) {
    if (t.linie) {
      for (let i = 0; i + 1 < t.ring.length; i++) {
        const [ax, ay] = t.ring[i], [bx, by] = t.ring[i + 1]
        const schritte = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (zelle / 2)))
        for (let k = 0; k <= schritte; k++) {
          const c = Math.floor((ax + ((bx - ax) * k) / schritte - x0) / zelle), r = Math.floor((ay + ((by - ay) * k) / schritte - y0) / zelle)
          if (c >= 0 && c < w && r >= 0 && r < h) m[r * w + c] = 1
        }
      }
      continue
    }
    const [, by0, , by1] = t.bbox
    const r0 = Math.max(0, Math.floor((by0 - y0) / zelle)), r1 = Math.min(h - 1, Math.ceil((by1 - y0) / zelle))
    const ring = t.ring
    for (let r = r0; r <= r1; r++) {
      const y = y0 + (r + 0.5) * zelle
      const xs: number[] = []
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j]
        if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi))
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) / zelle - 0.5)), c1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / zelle - 0.5))
        for (let c = c0; c <= c1; c++) m[r * w + c] = 1
      }
    }
  }
  return { m, w, h, x0, y0 }
}

/** Quadratisches Dilatieren/Erodieren mit Radius n (laufendes Maximum bzw. Minimum, zwei Durchläufe). */
function morph(m: Uint8Array, w: number, h: number, n: number, dilatieren: boolean): Uint8Array {
  const ziel = dilatieren ? 1 : 0
  const durch = (src: Uint8Array, horizontal: boolean): Uint8Array => {
    const dst = new Uint8Array(src.length)
    const laenge = horizontal ? w : h, bahnen = horizontal ? h : w
    for (let b = 0; b < bahnen; b++) {
      // Abstand zum nächsten Zielwert links/rechts
      const idx = (i: number) => (horizontal ? b * w + i : i * w + b)
      let letzt = -1e9
      const links = new Int32Array(laenge)
      for (let i = 0; i < laenge; i++) { if (src[idx(i)] === ziel) letzt = i; links[i] = i - letzt }
      letzt = 1e9
      for (let i = laenge - 1; i >= 0; i--) {
        if (src[idx(i)] === ziel) letzt = i
        const nah = Math.min(links[i], letzt - i)
        dst[idx(i)] = nah <= n ? ziel : 1 - ziel
      }
    }
    return dst
  }
  return durch(durch(m, true), false)
}

/** Alles, was vom Rand aus nicht erreichbar ist, gehört zum Gebäude (füllt Innenräume). */
function fuelleInnen(m: Uint8Array, w: number, h: number): Uint8Array {
  const aussen = new Uint8Array(m.length)
  const stack: number[] = []
  const rein = (i: number) => { if (!aussen[i] && !m[i]) { aussen[i] = 1; stack.push(i) } }
  for (let c = 0; c < w; c++) { rein(c); rein((h - 1) * w + c) }
  for (let r = 0; r < h; r++) { rein(r * w); rein(r * w + w - 1) }
  while (stack.length) {
    const i = stack.pop()!, c = i % w, r = (i - c) / w
    if (c > 0) rein(i - 1); if (c < w - 1) rein(i + 1); if (r > 0) rein(i - w); if (r < h - 1) rein(i + w)
  }
  const out = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) out[i] = aussen[i] ? 0 : 1
  return out
}

/** Randlinie der größten Fläche als Gitter-Eckpunkte (Zellkanten, im Uhrzeigersinn), nur Richtungswechsel. */
function randNachfahren(m: Uint8Array, w: number, h: number): [number, number][] {
  const an = (c: number, r: number) => (c >= 0 && c < w && r >= 0 && r < h ? m[r * w + c] === 1 : false)
  // Startzelle: erste gefüllte Zelle in Leserichtung (oben links)
  let sc = -1, sr = -1
  outer: for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (an(c, r)) { sc = c; sr = r; break outer }
  if (sc < 0) return []
  // Kantenverfolgung auf Gitterpunkten; wir laufen mit der Fläche rechts der Laufrichtung
  const pts: [number, number][] = []
  let x = sc, y = sr, dir = 0 // 0 = nach rechts (oben links der Startzelle, Fläche darunter)
  const dx = [1, 0, -1, 0], dy = [0, 1, 0, -1]
  const startX = x, startY = y
  let letzteDir = -1, schritte = 0
  const max = (w + 1) * (h + 1) * 4
  do {
    // Zellen vorn-links / vorn-rechts relativ zur Laufrichtung
    let vl: boolean, vr: boolean
    if (dir === 0) { vl = an(x, y - 1); vr = an(x, y) }
    else if (dir === 1) { vl = an(x, y); vr = an(x - 1, y) }
    else if (dir === 2) { vl = an(x - 1, y); vr = an(x - 1, y - 1) }
    else { vl = an(x - 1, y - 1); vr = an(x, y - 1) }
    let neu: number
    if (vr && !vl) neu = dir // geradeaus
    else if (vl) neu = (dir + 3) % 4 // links abbiegen
    else neu = (dir + 1) % 4 // rechts abbiegen
    if (neu !== letzteDir) { pts.push([x, y]); letzteDir = neu }
    dir = neu
    x += dx[dir]; y += dy[dir]
    if (++schritte > max) return []
  } while (!(x === startX && y === startY && (dir === 0 || schritte > 1)))
  return pts
}

function dp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts
  const n = pts.length
  // geschlossenen Ring: an den zwei am weitesten entfernten Punkten teilen
  let iMax = 0, dMax = -1
  for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y); if (d > dMax) { dMax = d; iMax = i } }
  const teil = (a: number, b: number, liste: Pt[]): Pt[] => {
    const A = liste[a], B = liste[b]
    let ix = -1, md = tol
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1e-9
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((B.y - A.y) * liste[i].x - (B.x - A.x) * liste[i].y + B.x * A.y - B.y * A.x) / len
      if (d > md) { md = d; ix = i }
    }
    if (ix < 0) return [A]
    return [...teil(a, ix, liste), ...teil(ix, b, liste)]
  }
  const ring1 = pts.slice(0, iMax + 1), ring2 = [...pts.slice(iMax), pts[0]]
  return [...teil(0, ring1.length - 1, ring1), ...teil(0, ring2.length - 1, ring2)]
}

/** Fast waagerechte/senkrechte Kanten exakt ausrichten (Koordinaten innerhalb von 1 Punkt zusammenführen). */
function ausrichten(pts: Pt[], tol: number): Pt[] {
  const verschmelze = (werte: number[]): Map<number, number> => {
    const sortiert = [...new Set(werte)].sort((a, b) => a - b)
    const karte = new Map<number, number>()
    let gruppe: number[] = []
    const abschluss = () => { if (!gruppe.length) return; const mw = gruppe.reduce((s, v) => s + v, 0) / gruppe.length; for (const v of gruppe) karte.set(v, mw); gruppe = [] }
    for (const v of sortiert) { if (gruppe.length && v - gruppe[gruppe.length - 1] > tol) abschluss(); gruppe.push(v) }
    abschluss()
    return karte
  }
  const kx = verschmelze(pts.map((p) => p.x)), ky = verschmelze(pts.map((p) => p.y))
  const neu = pts.map((p) => ({ x: kx.get(p.x)!, y: ky.get(p.y)! }))
  // doppelte Nachbarn und Punkte mitten auf einer Geraden entfernen
  const sauber: Pt[] = []
  for (const p of neu) { const l = sauber[sauber.length - 1]; if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 1e-9) sauber.push(p) }
  if (sauber.length > 1 && Math.hypot(sauber[0].x - sauber[sauber.length - 1].x, sauber[0].y - sauber[sauber.length - 1].y) < 1e-9) sauber.pop()
  const out: Pt[] = []
  for (let i = 0; i < sauber.length; i++) {
    const a = sauber[(i + sauber.length - 1) % sauber.length], b = sauber[i], c = sauber[(i + 1) % sauber.length]
    const kreuz = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(kreuz) > 1e-6) out.push(b)
  }
  return out
}

/** Nur die zusammenhängende Fläche behalten, die die Zelle (c, r) enthält. */
function komponente(m: Uint8Array, w: number, h: number, c0: number, r0: number): Uint8Array {
  const out = new Uint8Array(m.length)
  const start = r0 * w + c0
  if (c0 < 0 || c0 >= w || r0 < 0 || r0 >= h || !m[start]) return out
  const stack = [start]; out[start] = 1
  while (stack.length) {
    const i = stack.pop()!, c = i % w, r = (i - c) / w
    const nach = (j: number) => { if (m[j] && !out[j]) { out[j] = 1; stack.push(j) } }
    if (c > 0) nach(i - 1); if (c < w - 1) nach(i + 1); if (r > 0) nach(i - w); if (r < h - 1) nach(i + w)
  }
  return out
}

/** Rasterkoordinaten auf echte Koordinaten der Wandflächen einrasten (gibt zentimetergenaue Maße). */
function snapAufQuelle(pts: Pt[], cluster: Teil[], tol: number): Pt[] {
  const xs: number[] = [], ys: number[] = []
  for (const t of cluster) for (const [x, y] of t.ring) { xs.push(x); ys.push(y) }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b)
  const naechster = (liste: number[], v: number): number => {
    let lo = 0, hi = liste.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (liste[mid] < v) lo = mid + 1; else hi = mid }
    let best = v, bd = tol
    for (const i of [lo - 1, lo, lo + 1]) if (i >= 0 && i < liste.length && Math.abs(liste[i] - v) <= bd) { bd = Math.abs(liste[i] - v); best = liste[i] }
    return best
  }
  // gleiche Rasterwerte müssen auf gleiche Werte fallen, damit Kanten gerade bleiben
  const kx = new Map<number, number>(), ky = new Map<number, number>()
  for (const p of pts) { if (!kx.has(p.x)) kx.set(p.x, naechster(xs, p.x)); if (!ky.has(p.y)) ky.set(p.y, naechster(ys, p.y)) }
  return pts.map((p) => ({ x: kx.get(p.x)!, y: ky.get(p.y)! }))
}

export interface KonturErgebnis { kontur: Pt[]; anzahlFlaechen: number; farbe: string }

/** Außenkontur des Grundrisses, auf dessen Wandfläche geklickt wurde. null, wenn dort keine gefüllte Fläche liegt. */
export function aussenkontur(fl: VektorFlaeche[], klick: Pt, opt: KonturOptionen = {}): KonturErgebnis | null {
  const o = { ...STANDARD, ...opt }
  const teile = zuTeilen(fl)
  const start = teilUnterKlick(teile, klick, 1.2, o.fangRadius)
  if (!start) return null
  const cluster = wandCluster(teile, start, o.clusterAbstand, klick, o.maxRadius)
  const n = Math.ceil(o.schliessen / 2 / o.zelle)
  const rand = o.schliessen + 4
  const { m, w, h, x0, y0 } = rastere(cluster, o.zelle, rand)
  const zu = morph(morph(m, w, h, n, true), w, h, n, false)
  const gefuellt = fuelleInnen(zu, w, h)
  const eine = komponente(gefuellt, w, h, Math.floor((klick.x - x0) / o.zelle), Math.floor((klick.y - y0) / o.zelle))
  const grob = randNachfahren(eine, w, h)
  if (grob.length < 4) return null
  const pts = grob.map(([gx, gy]) => ({ x: x0 + gx * o.zelle, y: y0 + gy * o.zelle }))
  const kontur = snapAufQuelle(ausrichten(dp(pts, o.toleranz), Math.max(o.toleranz, 1.5)), cluster, o.zelle * 1.6)
  if (kontur.length < 3) return null
  return { kontur, anzahlFlaechen: cluster.length, farbe: start.fill }
}

/**
 * Wie aussenkontur, aber mit Meter-Werten: `meterJePunkt` ist der Maßstab (Meter je PDF-Punkt).
 * Lücken bis 3,5 m (Türen, Fenster, Terrassenöffnungen) werden geschlossen, Wandstücke bis 4,2 m
 * Abstand gehören zusammen, und es zählt nur ein Umkreis von 25 m um den Klick.
 */
export function aussenkonturMeter(fl: VektorFlaeche[], klick: Pt, meterJePunkt: number): KonturErgebnis | null {
  if (!(meterJePunkt > 0)) return null
  return aussenkontur(fl, klick, {
    schliessen: 3.5 / meterJePunkt,
    clusterAbstand: 4.2 / meterJePunkt,
    maxRadius: 25 / meterJePunkt,
    zelle: Math.max(0.5, 0.025 / meterJePunkt),
    fangRadius: 0.12 / meterJePunkt,
  })
}
