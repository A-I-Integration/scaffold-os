// ============================================================
// SCAFFOLD OS – Grundriss aus projizierten Dreiecken (IFC-Import)
//
// Reine Geometrie ohne Abhängigkeiten: Dreiecke eines Geschosses (Draufsicht, Meter) werden auf ein feines Raster
// gelegt, das Raster liefert die Außenkontur(en). Wände, die sich an Ecken überlappen, sind damit kein Problem
// (die Vereinigung entsteht durch das Raster, nicht durch Polygon-Verschneidung). Innenhöfe und Wandinneres
// (Löcher) werden verworfen: es zählt die Außenkontur.
//
// Genauigkeit: eine Rasterzelle (mindestens 5 cm, bei sehr großen Modellen größer – höchstens 2400 Zellen je Seite).
// Treppenstufen schräger Wände werden mit Douglas-Peucker (Toleranz 1,5 Zellen) geglättet.
// ============================================================
export type Punkt2 = [number, number]

export interface Raster { x0: number; y0: number; c: number; nx: number; ny: number }

export function rasterFuer(minX: number, minY: number, maxX: number, maxY: number, zelleMin = 0.05, maxZellen = 2400): Raster {
  const c = Math.max(zelleMin, Math.max(maxX - minX, maxY - minY) / maxZellen)
  const x0 = Math.floor(minX / c) * c - c, y0 = Math.floor(minY / c) * c - c
  return { x0, y0, c, nx: Math.ceil((maxX - x0) / c) + 2, ny: Math.ceil((maxY - y0) / c) + 2 }
}

export const neueMaske = (r: Raster): Uint8Array => new Uint8Array(r.nx * r.ny)

/** Dreiecke (x0,y0,x1,y1,x2,y2 je Dreieck, Meter) in die Maske eintragen: Zelle gefüllt, wenn ihr Mittelpunkt im Dreieck liegt */
export function fuelleDreiecke(r: Raster, tris: ArrayLike<number>, maske: Uint8Array): void {
  const { x0, y0, c, nx, ny } = r
  for (let t = 0; t + 5 < tris.length; t += 6) {
    const ax = tris[t], ay = tris[t + 1], bx = tris[t + 2], by = tris[t + 3], cx = tris[t + 4], cy = tris[t + 5]
    const flaeche2 = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
    if (!Number.isFinite(flaeche2) || Math.abs(flaeche2) < 1e-12) continue
    const vorz = flaeche2 > 0 ? 1 : -1
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / c)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / c))
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / c)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / c))
    const eps = -1e-9
    for (let j = j0; j <= j1; j++) {
      const py = y0 + (j + 0.5) * c
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * c
        const w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * vorz
        const w1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * vorz
        const w2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * vorz
        if (w0 >= eps && w1 >= eps && w2 >= eps) maske[j * nx + i] = 1
      }
    }
    // sehr schmale Dreiecke (dünner als eine Zelle) können alle Zellmittelpunkte verfehlen: Kanten zusätzlich ablaufen
    const langste = Math.max(Math.hypot(bx - ax, by - ay), Math.hypot(cx - bx, cy - by), Math.hypot(ax - cx, ay - cy))
    if (langste > 0 && Math.abs(flaeche2) / langste < c) {
      const kante = (px: number, py: number, qx: number, qy: number) => {
        const n = Math.max(1, Math.ceil(Math.hypot(qx - px, qy - py) / (c / 2)))
        for (let k = 0; k <= n; k++) {
          const i = Math.floor((px + ((qx - px) * k) / n - x0) / c), j = Math.floor((py + ((qy - py) * k) / n - y0) / c)
          if (i >= 0 && i < nx && j >= 0 && j < ny) maske[j * nx + i] = 1
        }
      }
      kante(ax, ay, bx, by); kante(bx, by, cx, cy); kante(cx, cy, ax, ay)
    }
  }
}

function dilatiere8(m: Uint8Array, nx: number, ny: number): Uint8Array {
  const o = new Uint8Array(m.length)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!m[j * nx + i]) continue
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj
      if (a >= 0 && a < nx && b >= 0 && b < ny) o[b * nx + a] = 1
    }
  }
  return o
}

function erodiere8(m: Uint8Array, nx: number, ny: number): Uint8Array {
  const o = new Uint8Array(m.length)
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    let alle = 1
    for (let dj = -1; dj <= 1 && alle; dj++) for (let di = -1; di <= 1; di++) if (!m[(j + dj) * nx + i + di]) { alle = 0; break }
    o[j * nx + i] = alle
  }
  return o
}

/** Alles, was vom Rand aus (über 4er-Nachbarn) nicht erreichbar ist, wird gefüllt */
function fuelleGeschlossene(m: Uint8Array, nx: number, ny: number): Uint8Array {
  const aussen = new Uint8Array(nx * ny)
  const stapel: number[] = []
  const start = (i: number, j: number) => { const k = j * nx + i; if (!m[k] && !aussen[k]) { aussen[k] = 1; stapel.push(k) } }
  for (let i = 0; i < nx; i++) { start(i, 0); start(i, ny - 1) }
  for (let j = 0; j < ny; j++) { start(0, j); start(nx - 1, j) }
  while (stapel.length > 0) {
    const k = stapel.pop()!
    const i = k % nx, j = (k - i) / nx
    if (i > 0) start(i - 1, j)
    if (i < nx - 1) start(i + 1, j)
    if (j > 0) start(i, j - 1)
    if (j < ny - 1) start(i, j + 1)
  }
  const o = new Uint8Array(nx * ny)
  for (let k = 0; k < o.length; k++) o[k] = aussen[k] ? 0 : 1
  return o
}

/**
 * Füllt den Raum innerhalb der Außenwände (und Innenhöfe), damit die Maske die Grundfläche zeigt. Vorher werden Spalten
 * bis zu zwei Zellen (10 cm) geschlossen, wie sie an Wandstößen entstehen (Wände, die sich nur in einem Punkt berühren).
 */
export function fuelleLoecher(r: Raster, maske: Uint8Array): void {
  const { nx, ny } = r
  const geschlossen = erodiere8(fuelleGeschlossene(dilatiere8(maske, nx, ny), nx, ny), nx, ny)
  for (let k = 0; k < maske.length; k++) if (geschlossen[k]) maske[k] = 1
}

export function inMaske(r: Raster, maske: Uint8Array, x: number, y: number): boolean {
  const i = Math.floor((x - r.x0) / r.c), j = Math.floor((y - r.y0) / r.c)
  return i >= 0 && i < r.nx && j >= 0 && j < r.ny && maske[j * r.nx + i] === 1
}

export function flaecheM2(r: Raster, maske: Uint8Array): number {
  let n = 0
  for (let k = 0; k < maske.length; k++) n += maske[k]
  return n * r.c * r.c
}

export function oderMaske(ziel: Uint8Array, quelle: Uint8Array): void {
  for (let k = 0; k < ziel.length; k++) if (quelle[k]) ziel[k] = 1
}

// ---------------------------------------------------------------- Kontur

interface Kante { von: number; nach: number; benutzt: boolean }

function douglasPeucker(p: Punkt2[], tol: number): Punkt2[] {
  if (p.length < 3) return p
  const a = p[0], b = p[p.length - 1]
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy)
  let dmax = -1, imax = 0
  for (let i = 1; i < p.length - 1; i++) {
    const d = l === 0 ? Math.hypot(p[i][0] - a[0], p[i][1] - a[1]) : Math.abs(dy * (p[i][0] - a[0]) - dx * (p[i][1] - a[1])) / l
    if (d > dmax) { dmax = d; imax = i }
  }
  if (dmax <= tol) return [a, b]
  const links = douglasPeucker(p.slice(0, imax + 1), tol), rechts = douglasPeucker(p.slice(imax), tol)
  return [...links.slice(0, -1), ...rechts]
}

function geschlossenVereinfachen(ring: Punkt2[], tol: number): Punkt2[] {
  if (ring.length < 4) return ring
  // am Punkt mit größtem Abstand zum ersten teilen, damit beide Hälften eine sinnvolle Sehne haben
  let k = 0, dm = -1
  for (let i = 1; i < ring.length; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > dm) { dm = d; k = i } }
  const h1 = douglasPeucker(ring.slice(0, k + 1), tol), h2 = douglasPeucker([...ring.slice(k), ring[0]], tol)
  return [...h1.slice(0, -1), ...h2.slice(0, -1)]
}

function ohneGeradeEcken(ring: Punkt2[]): Punkt2[] {
  const out: Punkt2[] = []
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a = ring[(i + n - 1) % n], b = ring[i], c = ring[(i + 1) % n]
    const kreuz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(kreuz) > 1e-9) out.push(b)
  }
  return out
}

/** Schnittpunkt der Geraden p1-p2 und p3-p4; null bei (fast) parallelen Geraden */
function schnitt(p1: Punkt2, p2: Punkt2, p3: Punkt2, p4: Punkt2): Punkt2 | null {
  const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1], d2x = p4[0] - p3[0], d2y = p4[1] - p3[1]
  const n = d1x * d2y - d1y * d2x
  if (Math.abs(n) < 1e-9 * Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y)) return null
  const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / n
  return [p1[0] + t * d1x, p1[1] + t * d1y]
}

/**
 * Schräge Wände ergeben im Raster Treppenstufen; nach der Vereinfachung bleiben dort kurze Kanten. Kanten unter `minM`
 * werden durch den Schnittpunkt ihrer Nachbarkanten ersetzt (Ecke an die richtige Stelle), flache Knicke unter `minGrad`
 * entfallen. Echte Vorsprünge unter `minM` (< 0,55 m) sind für den Umriss ohnehin zu klein (Mindestkante 0,5 m).
 */
function glaetteKurzeKanten(ring: Punkt2[], minM: number, minGrad: number): Punkt2[] {
  let r = ring.slice()
  for (let schutz = 0; schutz < 500 && r.length > 3; schutz++) {
    let k = -1, kl = Infinity
    for (let i = 0; i < r.length; i++) { const l = Math.hypot(r[(i + 1) % r.length][0] - r[i][0], r[(i + 1) % r.length][1] - r[i][1]); if (l < minM && l < kl) { kl = l; k = i } }
    if (k < 0) break
    const n = r.length
    const p = r[(k + n - 1) % n], a = r[k], b = r[(k + 1) % n], q = r[(k + 2) % n]
    const x = schnitt(p, a, b, q)
    const mitte: Punkt2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const neu = x && Math.hypot(x[0] - mitte[0], x[1] - mitte[1]) <= 3 * minM ? x : mitte
    const rest: Punkt2[] = []
    for (let i = 0; i < n; i++) { if (i === k) rest.push(neu); else if (i !== (k + 1) % n) rest.push(r[i]) }
    r = rest
  }
  // flache Knicke entfernen (Reststufen)
  for (let schutz = 0; schutz < 500 && r.length > 3; schutz++) {
    let entfernt = false
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length], b = r[i], c = r[(i + 1) % r.length]
      const w1 = Math.atan2(b[1] - a[1], b[0] - a[0]), w2 = Math.atan2(c[1] - b[1], c[0] - b[0])
      let d = Math.abs(w2 - w1); if (d > Math.PI) d = 2 * Math.PI - d
      if (d < (minGrad * Math.PI) / 180) { r.splice(i, 1); entfernt = true; break }
    }
    if (!entfernt) break
  }
  return r
}

const flaecheSigned = (p: Punkt2[]): number => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1] } return s / 2 }

/**
 * Außenkonturen der gefüllten Zellen (gegen den Uhrzeigersinn, Meter), größte zuerst. Löcher werden gezählt, aber nicht
 * zurückgegeben. Konturen kleiner als `minFlaecheM2` fallen weg (Rauschen).
 */
export function aussenkonturen(r: Raster, maske: Uint8Array, minFlaecheM2 = 0.5): { konturen: Punkt2[][]; loecher: number } {
  const { nx, ny, c, x0, y0 } = r
  const vkey = (i: number, j: number) => i * (ny + 1) + j
  const kanten: Kante[] = []
  const ab = new Map<number, number[]>()
  const add = (i0: number, j0: number, i1: number, j1: number) => {
    const e = { von: vkey(i0, j0), nach: vkey(i1, j1), benutzt: false }
    kanten.push(e)
    const l = ab.get(e.von)
    if (l) l.push(kanten.length - 1); else ab.set(e.von, [kanten.length - 1])
  }
  const voll = (i: number, j: number) => i >= 0 && i < nx && j >= 0 && j < ny && maske[j * nx + i] === 1
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!voll(i, j)) continue
    if (!voll(i, j - 1)) add(i, j, i + 1, j)
    if (!voll(i + 1, j)) add(i + 1, j, i + 1, j + 1)
    if (!voll(i, j + 1)) add(i + 1, j + 1, i, j + 1)
    if (!voll(i - 1, j)) add(i, j + 1, i, j)
  }
  const ij = (k: number): Punkt2 => [Math.floor(k / (ny + 1)), k % (ny + 1)]
  const konturen: { ring: Punkt2[]; flaeche: number }[] = []
  let loecher = 0
  for (let s = 0; s < kanten.length; s++) {
    if (kanten[s].benutzt) continue
    const ring: Punkt2[] = []
    let e = s
    for (let schutz = 0; schutz <= kanten.length + 1; schutz++) {
      const k = kanten[e]
      k.benutzt = true
      ring.push(ij(k.von))
      const kandidaten = (ab.get(k.nach) ?? []).filter((x) => !kanten[x].benutzt || x === s)
      if (kandidaten.length === 0) break
      if (kandidaten.length === 1) e = kandidaten[0]
      else {
        // Berührung über Eck: nach rechts abbiegen, damit getrennte Teile getrennt bleiben
        const [px, py] = ij(k.von), [qx, qy] = ij(k.nach)
        let best = kandidaten[0], bestKreuz = Infinity
        for (const x of kandidaten) {
          const [rx, ry] = ij(kanten[x].nach)
          const kreuz = (qx - px) * (ry - qy) - (qy - py) * (rx - qx)
          if (kreuz < bestKreuz) { bestKreuz = kreuz; best = x }
        }
        e = best
      }
      if (e === s) break
    }
    const fl = flaecheSigned(ring)
    if (fl < 0) { loecher++; continue }
    const weltRing = ring.map(([i, j]): Punkt2 => [x0 + i * c, y0 + j * c])
    const einfach = ohneGeradeEcken(glaetteKurzeKanten(geschlossenVereinfachen(ohneGeradeEcken(weltRing), 1.5 * c), 0.55, 4))
    const flM2 = flaecheSigned(einfach)
    if (einfach.length >= 3 && flM2 >= minFlaecheM2) konturen.push({ ring: einfach, flaeche: flM2 })
  }
  konturen.sort((a, b) => b.flaeche - a.flaeche)
  return { konturen: konturen.map((k) => k.ring), loecher }
}
