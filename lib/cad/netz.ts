// ============================================================
// SCAFFOLD OS – Dreiecksnetze: Datentyp, Kennzahlen und Gebäudehülle aus einer Punktwolke
//
// Koordinaten wie im CAD-Modell: x, y = Höhe (oben), z; Einheit Meter. Dreiecke gegen den Uhrzeigersinn von außen gesehen
// (Normalen zeigen aus dem Körper heraus), damit das Volumen positiv ist.
//
// `netzAusPunktwolke` bildet eine vereinfachte, geschlossene Hülle (Höhensäulen über einem Raster) – gedacht als Grundlage
// für Kollisionsprüfung und Schnitt, nicht als originalgetreue Oberfläche.
// ============================================================

export interface Netz {
  /** x, y, z je Punkt, flach */
  punkte: number[]
  /** drei Punktnummern je Dreieck, flach */
  dreiecke: number[]
}

export type Box3 = { min: [number, number, number]; max: [number, number, number] }

export const leeresNetz = (): Netz => ({ punkte: [], dreiecke: [] })
export const anzahlDreiecke = (n: Netz): number => n.dreiecke.length / 3

/** Umgebende Box; null bei leerem Netz. */
export function netzGrenzen(n: Netz): Box3 | null {
  if (n.punkte.length < 3) return null
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < n.punkte.length; i += 3) for (let k = 0; k < 3; k++) { const v = n.punkte[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v }
  return { min, max }
}

/** Volumen in m³ über vorzeichenbehaftete Tetraeder; nur bei geschlossenem Netz mit nach außen zeigenden Normalen aussagekräftig. */
export function netzVolumenM3(n: Netz): number {
  let v = 0
  const p = n.punkte
  for (let i = 0; i < n.dreiecke.length; i += 3) {
    const a = n.dreiecke[i] * 3, b = n.dreiecke[i + 1] * 3, c = n.dreiecke[i + 2] * 3
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6
  }
  return v
}

export function netzOberflaecheM2(n: Netz): number {
  let s = 0
  const p = n.punkte
  for (let i = 0; i < n.dreiecke.length; i += 3) {
    const a = n.dreiecke[i] * 3, b = n.dreiecke[i + 1] * 3, c = n.dreiecke[i + 2] * 3
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
    s += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
  }
  return s
}

/** Geschlossen und ohne Löcher: jede Kante gehört zu genau zwei Dreiecken mit entgegengesetzter Richtung (Punkte werden nach Lage zusammengeführt). */
export function istGeschlossen(n: Netz): boolean {
  const schluessel = new Map<string, number>()
  const id = (i: number): number => {
    const k = `${Math.round(n.punkte[i * 3] * 1e5)},${Math.round(n.punkte[i * 3 + 1] * 1e5)},${Math.round(n.punkte[i * 3 + 2] * 1e5)}`
    let v = schluessel.get(k)
    if (v === undefined) { v = schluessel.size; schluessel.set(k, v) }
    return v
  }
  const kanten = new Map<string, number>()
  for (let i = 0; i < n.dreiecke.length; i += 3) {
    const t = [id(n.dreiecke[i]), id(n.dreiecke[i + 1]), id(n.dreiecke[i + 2])]
    if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) continue
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3]
      const richtung = a < b ? 1 : -1
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      kanten.set(key, (kanten.get(key) ?? 0) + richtung)
    }
  }
  // Jede Kante muss einmal hin und einmal zurück laufen (Summe 0); Kanten mit Summe 0 aus zwei gleichen Richtungen kommen nicht vor, weil sonst Summe ±2
  for (const v of kanten.values()) if (v !== 0) return false
  return kanten.size > 0
}

/** Achsenparalleler Quader als geschlossenes Netz (12 Dreiecke). */
export function boxNetz(min: [number, number, number], max: [number, number, number]): Netz {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const punkte = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const dreiecke = [
    0, 3, 2, 0, 2, 1,   // z0 (Normale −z)
    4, 5, 6, 4, 6, 7,   // z1 (+z)
    0, 4, 7, 0, 7, 3,   // x0 (−x)
    1, 2, 6, 1, 6, 5,   // x1 (+x)
    0, 1, 5, 0, 5, 4,   // y0 (−y)
    3, 7, 6, 3, 6, 2,   // y1 (+y)
  ]
  return { punkte, dreiecke }
}

export function verschiebeNetz(n: Netz, d: [number, number, number]): Netz {
  const punkte = n.punkte.slice()
  for (let i = 0; i < punkte.length; i += 3) { punkte[i] += d[0]; punkte[i + 1] += d[1]; punkte[i + 2] += d[2] }
  return { punkte, dreiecke: n.dreiecke.slice() }
}

export interface PunktwolkeNetzOptionen {
  /** Rasterweite in m (Standard 0,3) */
  rasterM?: number
  /** Punkte unterhalb dieser Höhe über dem Boden zählen nicht zum Gebäude (Gelände, Weg), Standard 0,3 m */
  bodenM?: number
  /** Mindestzahl Punkte je Rasterzelle, Standard 1 */
  minPunkte?: number
  /** Höhe des Bodens in den Höhenwerten der Punkte; ohne Angabe das 0,5-%-Perzentil */
  bodenHoeheM?: number
  /** Alles über dieser Höhe (über dem Boden) abschneiden: die Hülle endet dort mit einer ebenen Fläche */
  kappeHoeheM?: number
}

export interface PunktwolkeNetz {
  netz: Netz
  /** Höhe des Bodens in der Punktwolke (0,5-%-Perzentil), die Hülle beginnt bei y = 0 */
  bodenHoeheM: number
  zellen: number
  hinweise: string[]
}

/**
 * Gebäudehülle aus einer Punktwolke (x, y waagerecht, z oben, Meter) – Ausgabe im CAD-Koordinatensystem (x, Höhe, z = y der Wolke).
 * Ablauf: Boden bestimmen → je Rasterzelle höchster Punkt → Gelände und vereinzelte Zellen verwerfen (nur die größte zusammenhängende Insel) →
 * kleine Lücken schließen → Säulen vom Boden bis zur Oberkante, nur sichtbare Flächen werden zu Dreiecken.
 */
export function netzAusPunktwolke(px: ArrayLike<number>, py: ArrayLike<number>, pz: ArrayLike<number>, opt: PunktwolkeNetzOptionen = {}): PunktwolkeNetz | null {
  const n = Math.min(px.length, py.length, pz.length)
  const raster = opt.rasterM ?? 0.3, bodenM = opt.bodenM ?? 0.3, minP = opt.minPunkte ?? 1
  if (n < 20 || raster <= 0) return null
  const hinweise: string[] = []

  // Boden: 0,5-%-Perzentil der Höhen (wie in der Gebäudeerkennung)
  const hoehen = Float64Array.from({ length: n }, (_, i) => pz[i]).sort()
  const boden = opt.bodenHoeheM ?? hoehen[Math.min(n - 1, Math.floor(n * 0.005))]
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(px[i]) || !Number.isFinite(py[i]) || !Number.isFinite(pz[i])) continue
    if (px[i] < x0) x0 = px[i]; if (px[i] > x1) x1 = px[i]
    if (py[i] < y0) y0 = py[i]; if (py[i] > y1) y1 = py[i]
  }
  const nx = Math.ceil((x1 - x0) / raster) + 1, ny = Math.ceil((y1 - y0) / raster) + 1
  if (nx * ny > 4_000_000) return null
  const hoch = new Float32Array(nx * ny).fill(-1), anz = new Uint32Array(nx * ny)
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(px[i]) || !Number.isFinite(py[i]) || !Number.isFinite(pz[i])) continue
    const c = Math.floor((px[i] - x0) / raster) + nx * Math.floor((py[i] - y0) / raster)
    const h = pz[i] - boden
    if (h > hoch[c]) hoch[c] = h
    anz[c]++
  }
  const belegt = new Uint8Array(nx * ny)
  for (let c = 0; c < nx * ny; c++) if (anz[c] >= minP && hoch[c] > bodenM) belegt[c] = 1

  // Kleine Lücken schließen: leere Zelle mit mindestens drei belegten Nachbarn (4er-Nachbarschaft) bekommt den Mittelwert
  const nachbarn = (c: number): number[] => {
    const x = c % nx, y = Math.floor(c / nx), r: number[] = []
    if (x > 0) r.push(c - 1); if (x < nx - 1) r.push(c + 1); if (y > 0) r.push(c - nx); if (y < ny - 1) r.push(c + nx)
    return r
  }
  const fuell: [number, number][] = []
  for (let c = 0; c < nx * ny; c++) {
    if (belegt[c]) continue
    const nb = nachbarn(c).filter((k) => belegt[k])
    if (nb.length >= 3) fuell.push([c, nb.reduce((s, k) => s + hoch[k], 0) / nb.length])
  }
  for (const [c, h] of fuell) { belegt[c] = 1; hoch[c] = h }

  // Größte zusammenhängende Insel (4er-Nachbarschaft)
  const marke = new Int32Array(nx * ny).fill(-1)
  let besteMarke = -1, besteGroesse = 0, m = 0
  for (let s = 0; s < nx * ny; s++) {
    if (!belegt[s] || marke[s] >= 0) continue
    const stapel = [s]; marke[s] = m; let g = 0
    while (stapel.length) {
      const c = stapel.pop()!; g++
      for (const k of nachbarn(c)) if (belegt[k] && marke[k] < 0) { marke[k] = m; stapel.push(k) }
    }
    if (g > besteGroesse) { besteGroesse = g; besteMarke = m }
    m++
  }
  if (besteMarke < 0 || besteGroesse < 4) return null
  if (m > 1) hinweise.push(`${m - 1} getrennte Bereiche der Punktwolke wurden verworfen (nur das größte zusammenhängende Gebäude bleibt).`)
  const aktiv = (c: number): boolean => marke[c] === besteMarke
  const kappe = opt.kappeHoeheM !== undefined && opt.kappeHoeheM > 0 ? opt.kappeHoeheM : Infinity
  const hoeheAn = (x: number, y: number): number => (x < 0 || y < 0 || x >= nx || y >= ny || !aktiv(x + nx * y) ? 0 : Math.round(Math.min(hoch[x + nx * y], kappe) * 1000) / 1000)

  const punkte: number[] = [], dreiecke: number[] = []
  const quad = (a: number[], b: number[], c: number[], d: number[]): void => {
    const i = punkte.length / 3
    punkte.push(...a, ...b, ...c, ...d)
    dreiecke.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }
  let zellen = 0
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const h = hoeheAn(x, y)
    if (h <= 0) continue
    zellen++
    const xa = x0 + x * raster, xb = xa + raster, za = y0 + y * raster, zb = za + raster
    quad([xa, h, za], [xa, h, zb], [xb, h, zb], [xb, h, za])           // oben (+y)
    quad([xa, 0, za], [xb, 0, za], [xb, 0, zb], [xa, 0, zb])           // unten (−y)
    const seiten: [number, number, () => void][] = [
      [x - 1, y, () => { const hn = hoeheAn(x - 1, y); if (h > hn) quad([xa, hn, za], [xa, hn, zb], [xa, h, zb], [xa, h, za]) }],   // −x
      [x + 1, y, () => { const hn = hoeheAn(x + 1, y); if (h > hn) quad([xb, hn, zb], [xb, hn, za], [xb, h, za], [xb, h, zb]) }],   // +x
      [x, y - 1, () => { const hn = hoeheAn(x, y - 1); if (h > hn) quad([xb, hn, za], [xa, hn, za], [xa, h, za], [xb, h, za]) }],   // −z
      [x, y + 1, () => { const hn = hoeheAn(x, y + 1); if (h > hn) quad([xa, hn, zb], [xb, hn, zb], [xb, h, zb], [xa, h, zb]) }],   // +z
    ]
    for (const s of seiten) s[2]()
  }
  return { netz: { punkte, dreiecke }, bodenHoeheM: boden, zellen, hinweise }
}
