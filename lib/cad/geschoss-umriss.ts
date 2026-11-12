// ============================================================
// SCAFFOLD OS – Umrisse je Geschoss zu EINEM Gebäudeumriss mit Höhe je Kante vereinen.
//
// Eingabe: je Geschoss ein Grundriss (Vieleck, Meter) und die Oberkante des Geschosses (m, bezogen auf ±0,00).
// Ergebnis: Außenkontur aller Geschosse zusammen (Vereinigung) und für jede Kante die Höhe des höchsten Geschosses,
// das an dieser Kante steht. So bekommt ein Anbau (Garage, Terrasse) automatisch seine niedrigere Höhe.
//
// Rechnerisch über ein Raster aus allen Eckkoordinaten (Koordinatenkompression) – exakt für rechtwinklige Grundrisse.
// Schräge Kanten werden NICHT vereinigt (dann kommt ein Fehlertext zurück, der Umriss muss von Hand gewählt werden).
// ============================================================

import type { UmrissPunkt } from '@/lib/calculations/cad-umriss'

export interface GeschossUmriss {
  name: string
  /** Oberkante des Geschosses (m, bezogen auf ±0,00) – bestimmt die Höhe der Kanten, an denen es außen liegt */
  obenM: number
  umriss: UmrissPunkt[]
}

export type GeschossVereinigung =
  | { ok: true; umriss: UmrissPunkt[]; kantenHoeheM: number[]; hoechsteM: number; hinweise: string[] }
  | { ok: false; fehler: string }

const r2 = (x: number) => Math.round(x * 100) / 100
const TOL = 0.005

function rechtwinklig(p: UmrissPunkt[]): boolean {
  return p.every((a, i) => {
    const b = p[(i + 1) % p.length]
    return Math.abs(a.x - b.x) < TOL || Math.abs(a.z - b.z) < TOL
  })
}

function punktInVieleck(x: number, z: number, p: UmrissPunkt[]): boolean {
  let innen = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j]
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) innen = !innen
  }
  return innen
}

export function vereinigeGeschosse(geschosse: GeschossUmriss[]): GeschossVereinigung {
  const g = geschosse.filter((s) => s.umriss.length >= 3 && s.obenM > 0)
  if (g.length === 0) return { ok: false, fehler: 'Kein Geschoss mit Umriss und Oberkante über ±0,00 vorhanden.' }
  const rund = g.map((s) => ({ ...s, umriss: s.umriss.map((q) => ({ x: r2(q.x), z: r2(q.z) })) }))
  const schraeg = rund.find((s) => !rechtwinklig(s.umriss))
  if (schraeg) return { ok: false, fehler: `Der Grundriss „${schraeg.name}“ hat schräge Kanten – die Vereinigung gelingt nur für rechtwinklige Grundrisse. Bitte den Umriss von Hand wählen.` }

  const xs = [...new Set(rund.flatMap((s) => s.umriss.map((q) => q.x)))].sort((a, b) => a - b)
  const zs = [...new Set(rund.flatMap((s) => s.umriss.map((q) => q.z)))].sort((a, b) => a - b)
  const nx = xs.length - 1, nz = zs.length - 1
  // Höhe je Zelle (0 = nicht bebaut)
  const h: number[][] = []
  for (let i = 0; i < nx; i++) {
    h[i] = []
    for (let j = 0; j < nz; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2
      let m = 0
      for (const s of rund) if (s.obenM > m && punktInVieleck(cx, cz, s.umriss)) m = s.obenM
      h[i][j] = m
    }
  }
  const zelle = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? 0 : h[i][j])

  // Randkanten mit der bebauten Fläche links der Laufrichtung (Umlauf gegen den Uhrzeigersinn in x/z-Ebene mit z nach unten = im Uhrzeigersinn)
  interface Rand { a: UmrissPunkt; b: UmrissPunkt; hoehe: number }
  const kanten: Rand[] = []
  const P = (i: number, j: number): UmrissPunkt => ({ x: xs[i], z: zs[j] })
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const c = h[i][j]
    if (!c) continue
    if (!zelle(i, j - 1)) kanten.push({ a: P(i, j), b: P(i + 1, j), hoehe: c }) // oben
    if (!zelle(i + 1, j)) kanten.push({ a: P(i + 1, j), b: P(i + 1, j + 1), hoehe: c }) // rechts
    if (!zelle(i, j + 1)) kanten.push({ a: P(i + 1, j + 1), b: P(i, j + 1), hoehe: c }) // unten
    if (!zelle(i - 1, j)) kanten.push({ a: P(i, j + 1), b: P(i, j), hoehe: c }) // links
  }
  if (kanten.length === 0) return { ok: false, fehler: 'Die Geschosse überdecken keine Fläche.' }

  const key = (q: UmrissPunkt) => `${q.x}|${q.z}`
  const ausgang = new Map<string, Rand[]>()
  kanten.forEach((k) => { const l = ausgang.get(key(k.a)) ?? []; l.push(k); ausgang.set(key(k.a), l) })
  const benutzt = new Set<Rand>()
  const ringe: Rand[][] = []
  for (const start of kanten) {
    if (benutzt.has(start)) continue
    const ring: Rand[] = []
    let akt: Rand | undefined = start
    while (akt && !benutzt.has(akt)) {
      benutzt.add(akt); ring.push(akt)
      const moegl: Rand[] = (ausgang.get(key(akt.b)) ?? []).filter((k: Rand) => !benutzt.has(k) || k === start)
      // bei mehreren Möglichkeiten (Berührung in einer Ecke) die Richtung wählen, die am stärksten nach links abbiegt
      const dx = akt.b.x - akt.a.x, dz = akt.b.z - akt.a.z
      moegl.sort((p, q) => {
        const wp = Math.atan2(dx * (p.b.z - p.a.z) - dz * (p.b.x - p.a.x), dx * (p.b.x - p.a.x) + dz * (p.b.z - p.a.z))
        const wq = Math.atan2(dx * (q.b.z - q.a.z) - dz * (q.b.x - q.a.x), dx * (q.b.x - q.a.x) + dz * (q.b.z - q.a.z))
        return wp - wq
      })
      akt = moegl[0]
      if (akt === start) break
    }
    ringe.push(ring)
  }
  const flaeche = (ring: Rand[]) => ring.reduce((t, k) => t + (k.a.x * k.b.z - k.b.x * k.a.z), 0) / 2
  ringe.sort((a, b) => Math.abs(flaeche(b)) - Math.abs(flaeche(a)))
  const hinweise: string[] = []
  if (ringe.length > 1) hinweise.push(`Die Geschosse ergeben ${ringe.length} getrennte Konturen (z. B. Innenhof oder getrennte Baukörper) – nur die größte Außenkontur wird übernommen.`)
  const ring = ringe[0]

  // gleich hohe, gleichgerichtete Nachbarkanten zusammenfassen
  const teile: { a: UmrissPunkt; b: UmrissPunkt; hoehe: number }[] = []
  for (const k of ring) {
    const l = teile[teile.length - 1]
    if (l) {
      const d1x = l.b.x - l.a.x, d1z = l.b.z - l.a.z, d2x = k.b.x - k.a.x, d2z = k.b.z - k.a.z
      const gleiche = Math.abs(d1x * d2z - d1z * d2x) < 1e-9 && d1x * d2x + d1z * d2z > 0
      if (gleiche && Math.abs(l.hoehe - k.hoehe) < 1e-9) { l.b = k.b; continue }
    }
    teile.push({ a: k.a, b: k.b, hoehe: k.hoehe })
  }
  const erst = teile[0], letzt = teile[teile.length - 1]
  if (teile.length > 1) {
    const d1x = letzt.b.x - letzt.a.x, d1z = letzt.b.z - letzt.a.z, d2x = erst.b.x - erst.a.x, d2z = erst.b.z - erst.a.z
    if (Math.abs(d1x * d2z - d1z * d2x) < 1e-9 && d1x * d2x + d1z * d2z > 0 && Math.abs(letzt.hoehe - erst.hoehe) < 1e-9) { erst.a = letzt.a; teile.pop() }
  }
  const umriss = teile.map((t) => t.a)
  const kantenHoeheM = teile.map((t) => t.hoehe)
  const hoechsteM = Math.max(...kantenHoeheM)
  return { ok: true, umriss, kantenHoeheM, hoechsteM, hinweise }
}
