// ============================================================
// SCAFFOLD OS – Grundriss (Umriss) automatisch aus 3D-Daten erkennen
//
// Eingabe: Punkte und/oder Dreiecke eines Gebäudes, von oben gesehen (x/z in Metern).
// Ablauf (reine Geometrie, ohne KI, läuft im Browser):
//   1. Hauptrichtung des Gebäudes finden (kleinstes umschließendes Rechteck).
//   2. Gebäude in dieser Richtung in ein Raster legen und die Fläche füllen.
//   3. Kleine Kerben/Vorsprünge (< Mindestmaß) glätten.
//   4. Außenkontur ablaufen → rechtwinkliges Vieleck. Ecken zählen → Form.
// Das Ergebnis ist ein VORSCHLAG (Genauigkeit ≈ Rasterweite) und wird geprüft angezeigt.
// ============================================================
import { type UmrissPunkt, pruefeUmriss, normalisiereUmriss, zentriereUmriss, umrissFlaecheSigned, UMRISS_MAX_PUNKTE } from '@/lib/calculations/cad-umriss'

export type Punkt2 = [number, number]
/** Dreieck in der Draufsicht: x1,z1,x2,z2,x3,z3 */
export type Dreieck2 = [number, number, number, number, number, number]

export type GrundrissForm = 'rechteck' | 'l-form' | 'vieleck'

export interface GrundrissErgebnis {
  umriss: UmrissPunkt[]
  form: GrundrissForm
  /** Anzahl Ecken des erkannten Umrisses */
  ecken: number
  /** Davon Innenecken (z. B. 1 bei L-Form) */
  innenecken: number
  flaecheM2: number
  laengeM: number
  breiteM: number
  /** Rasterweite in m – so genau ist das Ergebnis höchstens */
  genauigkeitM: number
  /** Hauptrichtung in Grad (Drehung des Gebäudes gegen die Achsen) */
  drehungGrad: number
  hinweise: string[]
}

const MAX_RASTER = 320
const MIN_MERKMAL_M = 0.8

export function huelle(pts: Punkt2[]): Punkt2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const kreuz = (o: Punkt2, a: Punkt2, b: Punkt2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const unten: Punkt2[] = []
  for (const q of p) { while (unten.length >= 2 && kreuz(unten[unten.length - 2], unten[unten.length - 1], q) <= 0) unten.pop(); unten.push(q) }
  const oben: Punkt2[] = []
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (oben.length >= 2 && kreuz(oben[oben.length - 2], oben[oben.length - 1], q) <= 0) oben.pop(); oben.push(q) }
  unten.pop(); oben.pop()
  return unten.concat(oben)
}

/** Winkel (Rad, 0…π/2), bei dem das umschließende Rechteck die kleinste Fläche hat. */
export function hauptrichtung(pts: Punkt2[]): number {
  const h = huelle(pts)
  if (h.length < 3) return 0
  let besteA = Infinity, besterW = 0
  for (let g = 0; g < 90; g += 0.5) {
    const w = (g * Math.PI) / 180, c = Math.cos(w), s = Math.sin(w)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, z] of h) { const u = x * c + z * s, v = -x * s + z * c; if (u < minX) minX = u; if (u > maxX) maxX = u; if (v < minY) minY = v; if (v > maxY) maxY = v }
    const a = (maxX - minX) * (maxY - minY)
    if (a < besteA - 1e-9) { besteA = a; besterW = w }
  }
  return besterW
}

export type Maske = Uint8Array

export function dilatiere(m: Maske, nx: number, ny: number, r: number): Maske {
  const aus = new Uint8Array(m.length)
  // getrennt: erst waagrecht, dann senkrecht
  const t = new Uint8Array(m.length)
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (!m[y * nx + x]) continue
    for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < nx) t[y * nx + xx] = 1 }
  }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (!t[y * nx + x]) continue
    for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < ny) aus[yy * nx + x] = 1 }
  }
  return aus
}

export function erodiere(m: Maske, nx: number, ny: number, r: number): Maske {
  const inv = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1
  // Rand zählt als „leer“: sonst würde die Maske am Rand nicht schrumpfen
  const gross = dilatiere(inv, nx, ny, r)
  const aus = new Uint8Array(m.length)
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (!m[y * nx + x]) continue
    if (x < r || y < r || x >= nx - r || y >= ny - r) continue
    if (!gross[y * nx + x]) aus[y * nx + x] = 1
  }
  return aus
}

export function fuelleInneres(m: Maske, nx: number, ny: number): Maske {
  // Außenraum per Flutfüllung vom Rand aus; alles andere ist Gebäude
  const aussen = new Uint8Array(m.length)
  const stapel: number[] = []
  const start = (x: number, y: number) => { const i = y * nx + x; if (!m[i] && !aussen[i]) { aussen[i] = 1; stapel.push(i) } }
  for (let x = 0; x < nx; x++) { start(x, 0); start(x, ny - 1) }
  for (let y = 0; y < ny; y++) { start(0, y); start(nx - 1, y) }
  while (stapel.length) {
    const i = stapel.pop()!
    const x = i % nx, y = (i - x) / nx
    if (x > 0) start(x - 1, y)
    if (x < nx - 1) start(x + 1, y)
    if (y > 0) start(x, y - 1)
    if (y < ny - 1) start(x, y + 1)
  }
  const aus = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) aus[i] = aussen[i] ? 0 : 1
  return aus
}

export function groessteInsel(m: Maske, nx: number, ny: number): Maske {
  const label = new Int32Array(m.length)
  let besteL = 0, besteGr = 0, l = 0
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || label[s]) continue
    l++
    let gr = 0
    const stapel = [s]; label[s] = l
    while (stapel.length) {
      const i = stapel.pop()!; gr++
      const x = i % nx, y = (i - x) / nx
      const nb = [x > 0 ? i - 1 : -1, x < nx - 1 ? i + 1 : -1, y > 0 ? i - nx : -1, y < ny - 1 ? i + nx : -1]
      for (const j of nb) if (j >= 0 && m[j] && !label[j]) { label[j] = l; stapel.push(j) }
    }
    if (gr > besteGr) { besteGr = gr; besteL = l }
  }
  const aus = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) if (label[i] === besteL && besteL) aus[i] = 1
  return aus
}

/** Außenkontur der Maske als Eckpunkte in Rasterkoordinaten (rechtwinklig, ohne Zwischenpunkte). */
function kontur(m: Maske, nx: number, ny: number): Punkt2[] | null {
  const belegt = (x: number, y: number) => x >= 0 && y >= 0 && x < nx && y < ny && m[y * nx + x] === 1
  // Gerichtete Kanten (Gebäude links der Kante), Schlüssel = Startpunkt
  const kanten = new Map<number, number[]>()
  const key = (x: number, y: number) => y * (nx + 1) + x
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const k = key(x1, y1)
    const a = kanten.get(k)
    const ziel = key(x2, y2)
    if (a) a.push(ziel); else kanten.set(k, [ziel])
  }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (!belegt(x, y)) continue
    if (!belegt(x, y - 1)) add(x, y, x + 1, y)
    if (!belegt(x + 1, y)) add(x + 1, y, x + 1, y + 1)
    if (!belegt(x, y + 1)) add(x + 1, y + 1, x, y + 1)
    if (!belegt(x - 1, y)) add(x, y + 1, x, y)
  }
  if (kanten.size === 0) return null
  // Längste Schleife ablaufen (Außenkontur)
  const benutzt = new Set<string>()
  let beste: number[] = []
  for (const [startK, ziele] of kanten) {
    for (const z0 of ziele) {
      const id0 = startK + ':' + z0
      if (benutzt.has(id0)) continue
      const schleife: number[] = [startK]
      let von = startK, zu = z0
      benutzt.add(id0)
      let schutz = 0
      while (zu !== startK && schutz++ < 2_000_000) {
        schleife.push(zu)
        const moegl = kanten.get(zu)
        if (!moegl) break
        // Bei Verzweigung (Berührung im Eckpunkt) die Kante wählen, die zuerst „links abbiegt“
        let wahl = moegl[0]
        if (moegl.length > 1) {
          const vx = (zu % (nx + 1)) - (von % (nx + 1)), vy = Math.floor(zu / (nx + 1)) - Math.floor(von / (nx + 1))
          let besterWert = -Infinity
          for (const c of moegl) {
            const wx = (c % (nx + 1)) - (zu % (nx + 1)), wy = Math.floor(c / (nx + 1)) - Math.floor(zu / (nx + 1))
            const w = vx * wy - vy * wx // >0 = Rechtsabbiegen in Rasterkoordinaten
            if (w > besterWert) { besterWert = w; wahl = c }
          }
        }
        benutzt.add(zu + ':' + wahl)
        von = zu; zu = wahl
      }
      if (zu === startK && schleife.length > beste.length) beste = schleife
    }
  }
  if (beste.length < 4) return null
  const pts: Punkt2[] = beste.map((k) => [k % (nx + 1), Math.floor(k / (nx + 1))])
  // Nur echte Ecken behalten
  const ecken: Punkt2[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length]
    const k = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (k !== 0) ecken.push(b)
  }
  return ecken.length >= 4 ? ecken : null
}

/**
 * Rechtwinklige Kontur: winzige Stufen (kürzer als `minLen` Rasterzellen), die durch das Raster
 * entstehen, werden eingeebnet. Zwei benachbarte Ecken einer kurzen Kante fallen weg.
 */
function bereinigeStufen(ecken: Punkt2[], minLen: number): Punkt2[] {
  let p = ecken.map((q) => [q[0], q[1]] as Punkt2)
  const entferneGleiche = () => {
    let geaendert = true
    while (geaendert && p.length >= 4) {
      geaendert = false
      for (let i = 0; i < p.length; i++) {
        const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length]
        const k = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if ((a[0] === b[0] && a[1] === b[1]) || k === 0) { p.splice(i, 1); geaendert = true; break }
      }
    }
  }
  for (let runde = 0; runde < 200 && p.length > 4; runde++) {
    let besteI = -1, besteL = Infinity
    for (let i = 0; i < p.length; i++) {
      const b = p[i], c = p[(i + 1) % p.length]
      const l = Math.abs(c[0] - b[0]) + Math.abs(c[1] - b[1])
      if (l < minLen && l < besteL) { besteL = l; besteI = i }
    }
    if (besteI < 0) break
    const n = p.length
    const i0 = (besteI + n - 1) % n, i1 = besteI, i2 = (besteI + 1) % n, i3 = (besteI + 2) % n
    // Kante i0→i1 und i2→i3 sind parallel; i2/i3 auf die Linie von i0→i1 legen
    const waagrecht = p[i0][1] === p[i1][1]
    const neu: Punkt2 = waagrecht ? [p[i3][0], p[i0][1]] : [p[i0][0], p[i3][1]]
    const alt = p.map((q) => q)
    alt[i3] = neu
    // die beiden Ecken der kurzen Kante entfernen
    const rest = alt.filter((_, j) => j !== i1 && j !== i2)
    p = rest
    entferneGleiche()
  }
  entferneGleiche()
  return p
}

function setzeDreieck(m: Maske, nx: number, ny: number, d: Dreieck2, ox: number, oy: number, c: number) {
  const px = [(d[0] - ox) / c, (d[2] - ox) / c, (d[4] - ox) / c]
  const py = [(d[1] - oy) / c, (d[3] - oy) / c, (d[5] - oy) / c]
  const x0 = Math.max(0, Math.floor(Math.min(...px))), x1 = Math.min(nx - 1, Math.floor(Math.max(...px)))
  const y0 = Math.max(0, Math.floor(Math.min(...py))), y1 = Math.min(ny - 1, Math.floor(Math.max(...py)))
  const kante = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2))
    for (let i = 0; i <= n; i++) {
      const x = Math.floor(ax + ((bx - ax) * i) / n), y = Math.floor(ay + ((by - ay) * i) / n)
      if (x >= 0 && y >= 0 && x < nx && y < ny) m[y * nx + x] = 1
    }
  }
  kante(px[0], py[0], px[1], py[1]); kante(px[1], py[1], px[2], py[2]); kante(px[2], py[2], px[0], py[0])
  const det = (py[1] - py[2]) * (px[0] - px[2]) + (px[2] - px[1]) * (py[0] - py[2])
  if (Math.abs(det) < 1e-9) return
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const qx = x + 0.5, qy = y + 0.5
    const a = ((py[1] - py[2]) * (qx - px[2]) + (px[2] - px[1]) * (qy - py[2])) / det
    const b = ((py[2] - py[0]) * (qx - px[2]) + (px[0] - px[2]) * (qy - py[2])) / det
    if (a >= 0 && b >= 0 && a + b <= 1) m[y * nx + x] = 1
  }
}

/** Streupunkte weit weg vom Gebäude entfernen (sonst verfälschen sie die Hauptrichtung). */
function ohneAusreisser(pts: Punkt2[]): Punkt2[] {
  if (pts.length < 50) return pts
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  const gr = Math.max(maxX - minX, maxY - minY)
  if (!(gr > 0)) return pts
  const z = gr / 100
  const nx = Math.floor((maxX - minX) / z) + 1, ny = Math.floor((maxY - minY) / z) + 1
  const m: Maske = new Uint8Array(nx * ny)
  for (const [x, y] of pts) m[Math.floor((y - minY) / z) * nx + Math.floor((x - minX) / z)] = 1
  const insel = groessteInsel(dilatiere(m, nx, ny, 1), nx, ny)
  return pts.filter(([x, y]) => insel[Math.floor((y - minY) / z) * nx + Math.floor((x - minX) / z)] === 1)
}

export interface GrundrissEingabe {
  punkte?: Punkt2[]
  dreiecke?: Dreieck2[]
}

/**
 * Erkennt Grundriss und Form. Gibt null zurück, wenn zu wenig Geometrie da ist oder keine
 * sinnvolle Außenkontur entsteht (dann bleibt es bei den eingegebenen Maßen).
 */
export function erkenneGrundriss(eingabe: GrundrissEingabe): GrundrissErgebnis | null {
  const punkte = ohneAusreisser(eingabe.punkte ?? [])
  const dreiecke = eingabe.dreiecke ?? []
  const alle: Punkt2[] = [...punkte]
  for (const d of dreiecke) { alle.push([d[0], d[1]], [d[2], d[3]], [d[4], d[5]]) }
  if (alle.length < 3) return null
  const w = hauptrichtung(alle)
  const c0 = Math.cos(w), s0 = Math.sin(w)
  const dreh = (x: number, z: number): Punkt2 => [x * c0 + z * s0, -x * s0 + z * c0]
  const gedreht = alle.map(([x, z]) => dreh(x, z))
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of gedreht) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  const bx = maxX - minX, by = maxY - minY
  if (!(bx > 1 && by > 1)) return null
  const zelle = Math.max(0.1, Math.max(bx, by) / MAX_RASTER)
  const luecke = Math.max(1, Math.round(0.5 / zelle))
  const glatt = Math.max(1, Math.round(MIN_MERKMAL_M / 2 / zelle))
  const rand = luecke + glatt + 3
  const nx = Math.ceil(bx / zelle) + 2 * rand, ny = Math.ceil(by / zelle) + 2 * rand
  const ox = minX - rand * zelle, oy = minY - rand * zelle
  let m: Maske = new Uint8Array(nx * ny)
  const setze = (x: number, y: number) => {
    const ix = Math.floor((x - ox) / zelle), iy = Math.floor((y - oy) / zelle)
    if (ix >= 0 && iy >= 0 && ix < nx && iy < ny) m[iy * nx + ix] = 1
  }
  for (const [x, y] of gedreht.slice(0, punkte.length)) setze(x, y)
  for (const d of dreiecke) {
    const a = dreh(d[0], d[1]), b = dreh(d[2], d[3]), cc = dreh(d[4], d[5])
    setzeDreieck(m, nx, ny, [a[0], a[1], b[0], b[1], cc[0], cc[1]], ox, oy, zelle)
  }
  // Lücken schließen (Punktwolken sind dünn besetzt), Inneres füllen, wieder zurück
  m = dilatiere(m, nx, ny, luecke)
  m = fuelleInneres(m, nx, ny)
  m = erodiere(m, nx, ny, luecke)
  // Kleine Kerben und Vorsprünge glätten
  m = dilatiere(erodiere(m, nx, ny, glatt), nx, ny, glatt) // Öffnen: kleine Vorsprünge weg
  m = erodiere(dilatiere(m, nx, ny, glatt), nx, ny, glatt) // Schließen: kleine Kerben weg
  m = groessteInsel(m, nx, ny)
  const ecken = kontur(m, nx, ny)
  if (!ecken) return null
  const hinweise: string[] = []
  let umriss: UmrissPunkt[] = bereinigeStufen(ecken, Math.max(2, Math.ceil(0.6 / zelle))).map(([gx, gy]) => {
    const u = ox + gx * zelle, v = oy + gy * zelle
    return { x: u * c0 - v * s0, z: u * s0 + v * c0 }
  })
  if (umriss.length > UMRISS_MAX_PUNKTE) return null
  umriss = zentriereUmriss(normalisiereUmriss(umriss))
  const fehler = pruefeUmriss(umriss)
  if (fehler.length > 0) return null
  // Innenecken zählen
  let innen = 0
  const flaeche = umrissFlaecheSigned(umriss)
  for (let i = 0; i < umriss.length; i++) {
    const a = umriss[(i + umriss.length - 1) % umriss.length], b = umriss[i], cc = umriss[(i + 1) % umriss.length]
    const k = (b.x - a.x) * (cc.z - b.z) - (b.z - a.z) * (cc.x - b.x)
    if (k * flaeche < 0) innen++
  }
  const form: GrundrissForm = umriss.length === 4 ? 'rechteck' : umriss.length === 6 && innen === 1 ? 'l-form' : 'vieleck'
  // Länge/Breite in Gebäuderichtung (bei gedrehtem Gebäude NICHT die Achsen-Box)
  const us = umriss.map((p) => p.x * c0 + p.z * s0), vs = umriss.map((p) => -p.x * s0 + p.z * c0)
  const a1 = Math.max(...us) - Math.min(...us), a2 = Math.max(...vs) - Math.min(...vs)
  const l = Math.max(a1, a2), br = Math.min(a1, a2)
  const dg = ((w * 180) / Math.PI) % 90
  if (zelle > 0.25) hinweise.push(`Raster ${zelle.toFixed(2)} m – Maße sind auf etwa ${(zelle * 100).toFixed(0)} cm genau.`)
  return {
    umriss, form, ecken: umriss.length, innenecken: innen, flaecheM2: Math.round(Math.abs(flaeche) * 10) / 10,
    laengeM: Math.round(l * 100) / 100, breiteM: Math.round(br * 100) / 100,
    genauigkeitM: Math.round(zelle * 100) / 100, drehungGrad: Math.round(dg * 10) / 10, hinweise,
  }
}

export const FORM_NAME: Record<GrundrissForm, string> = { rechteck: 'Rechteck', 'l-form': 'L-Form', vieleck: 'Vieleck' }
