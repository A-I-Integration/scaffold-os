// ============================================================
// SCAFFOLD OS – Sichtbare Fassadenflächen aus gestapelten Geschosskonturen.
//
// Die Funktion ersetzt NICHT den CAD-Umriss. Sie liefert zunächst eine
// geprüfte, eigenständige Geometrie der vertikalen Wandstreifen. Damit
// lassen sich Rücksprünge als eigene Fassadenflächen abbilden, statt sie
// in eine einzige Außenkontur mit nur einer Kantenhöhe zu pressen.
//
// Unterstützt werden rechtwinklige Polygone. Schräge Kanten, ungültige
// Höhen und nicht geschlossene/zu kleine Konturen werden abgelehnt.
// ============================================================

import type { UmrissPunkt } from '@/lib/calculations/cad-umriss'

export interface GeschossFuerFassade {
  name: string
  /** Tatsächliche Oberkante der Außenwand, bezogen auf ±0,00. */
  obenM: number
  umriss: UmrissPunkt[]
}

export interface FassadenFlaeche {
  geschoss: string
  /** Endpunkte der horizontalen Fassadenkante im Grundriss. */
  von: UmrissPunkt
  bis: UmrissPunkt
  /** Sichtbarer vertikaler Wandstreifen. */
  untenM: number
  obenM: number
  /** Außenrichtung der Fläche in der x/z-Ebene. */
  seite: 'oben' | 'rechts' | 'unten' | 'links'
}

export type FassadenErgebnis =
  | { ok: true; flaechen: FassadenFlaeche[]; gesamtFlaecheM2: number; hoechsteM: number }
  | { ok: false; fehler: string }

const TOL = 0.005
const r2 = (n: number) => Math.round(n * 100) / 100

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

/**
 * Erzeugt sichtbare vertikale Fassadenstreifen aus übereinanderliegenden
 * Geschossgrundrissen. Die Unterkante eines oberen Geschosses wird aus der
 * höchsten niedrigeren Geschossoberkante ermittelt, deren Grundriss diesen
 * Rasterbereich überdeckt. Seitlich angrenzende, niedrigere Baukörper
 * begrenzen den sichtbaren Streifen zusätzlich nach oben/unten.
 */
export function fassadenFlaechenAusGeschossen(geschosse: GeschossFuerFassade[]): FassadenErgebnis {
  if (!Array.isArray(geschosse) || geschosse.length === 0) {
    return { ok: false, fehler: 'Keine Geschosskonturen übergeben.' }
  }
  for (const g of geschosse) {
    if (!g.name?.trim() || !Array.isArray(g.umriss) || g.umriss.length < 3) {
      return { ok: false, fehler: 'Jedes Geschoss benötigt einen Namen und mindestens drei Umrisspunkte.' }
    }
    if (!Number.isFinite(g.obenM) || g.obenM <= 0) {
      return { ok: false, fehler: `Die Oberkante von „${g.name}“ muss eine positive, endliche Höhe sein.` }
    }
    if (g.umriss.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))) {
      return { ok: false, fehler: `Der Umriss von „${g.name}“ enthält ungültige Koordinaten.` }
    }
    if (!rechtwinklig(g.umriss)) {
      return { ok: false, fehler: `Der Umriss von „${g.name}“ enthält schräge Kanten. Diese Fassadenberechnung unterstützt derzeit nur rechtwinklige Konturen.` }
    }
  }

  const daten = geschosse.map((g) => ({ ...g, umriss: g.umriss.map((p) => ({ x: r2(p.x), z: r2(p.z) })) }))
  const xs = [...new Set(daten.flatMap((g) => g.umriss.map((p) => p.x)))].sort((a, b) => a - b)
  const zs = [...new Set(daten.flatMap((g) => g.umriss.map((p) => p.z)))].sort((a, b) => a - b)
  const nx = xs.length - 1, nz = zs.length - 1
  if (nx < 1 || nz < 1) return { ok: false, fehler: 'Die Geschosskonturen bilden keine auswertbare Fläche.' }

  type Zelle = { oben: number; unten: number; name: string } | null
  const raster: Zelle[][] = Array.from({ length: nx }, () => Array.from({ length: nz }, () => null))

  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = (xs[i] + xs[i + 1]) / 2
    const z = (zs[j] + zs[j + 1]) / 2
    const aktiv = daten.filter((g) => punktInVieleck(x, z, g.umriss)).sort((a, b) => a.obenM - b.obenM)
    if (aktiv.length === 0) continue
    const oberstes = aktiv[aktiv.length - 1]
    const darunter = aktiv.filter((g) => g.obenM < oberstes.obenM - 1e-6)
    raster[i][j] = {
      oben: oberstes.obenM,
      unten: darunter.length ? darunter[darunter.length - 1].obenM : 0,
      name: oberstes.name,
    }
  }

  const zelle = (i: number, j: number): Zelle => i < 0 || j < 0 || i >= nx || j >= nz ? null : raster[i][j]
  const p = (i: number, j: number): UmrissPunkt => ({ x: xs[i], z: zs[j] })
  const flaechen: FassadenFlaeche[] = []

  const add = (i: number, j: number, nachbar: Zelle, von: UmrissPunkt, bis: UmrissPunkt, seite: FassadenFlaeche['seite']) => {
    const c = zelle(i, j)
    if (!c || c.oben <= (nachbar?.oben ?? 0) + 1e-6) return
    const unten = Math.max(c.unten, nachbar?.oben ?? 0)
    if (c.oben <= unten + 1e-6) return
    flaechen.push({ geschoss: c.name, von, bis, untenM: unten, obenM: c.oben, seite })
  }

  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const c = zelle(i, j)
    if (!c) continue
    add(i, j, zelle(i, j - 1), p(i, j), p(i + 1, j), 'oben')
    add(i, j, zelle(i + 1, j), p(i + 1, j), p(i + 1, j + 1), 'rechts')
    add(i, j, zelle(i, j + 1), p(i + 1, j + 1), p(i, j + 1), 'unten')
    add(i, j, zelle(i - 1, j), p(i, j + 1), p(i, j), 'links')
  }

  // Benachbarte Streifen derselben Fassade mit identischen Höhen zusammenfassen.
  const zusammen: FassadenFlaeche[] = []
  for (const f of flaechen) {
    const last = zusammen[zusammen.length - 1]
    const parallel = last && last.seite === f.seite && last.geschoss === f.geschoss
      && Math.abs(last.untenM - f.untenM) < 1e-6 && Math.abs(last.obenM - f.obenM) < 1e-6
    const anschluss = parallel && Math.abs(last!.bis.x - f.von.x) < TOL && Math.abs(last!.bis.z - f.von.z) < TOL
    const gleicheRichtung = anschluss && Math.abs((last!.bis.x - last!.von.x) * (f.bis.z - f.von.z) - (last!.bis.z - last!.von.z) * (f.bis.x - f.von.x)) < 1e-6
    if (gleicheRichtung) last!.bis = f.bis
    else zusammen.push({ ...f })
  }

  const gesamtFlaecheM2 = zusammen.reduce((sum, f) => {
    const laenge = Math.hypot(f.bis.x - f.von.x, f.bis.z - f.von.z)
    return sum + laenge * (f.obenM - f.untenM)
  }, 0)
  return { ok: true, flaechen: zusammen, gesamtFlaecheM2, hoechsteM: Math.max(...daten.map((g) => g.obenM)) }
}
