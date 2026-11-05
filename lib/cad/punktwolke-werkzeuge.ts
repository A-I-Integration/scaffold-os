// ============================================================
// SCAFFOLD OS – Punktwolke bereinigen und messen
//
// Alle Punktlisten sind flach [x, y, z, …] in Metern mit z = oben. Bereinigen liefert eine Maske (1 = behalten), die mit
// `wendeMaskeAn` auf Positionen UND Farben der Anzeige-Punktwolke angewendet wird – so bleiben beide gleich lang.
// Messen: Strecken (räumlich, waagerecht, Höhenunterschied) und Polygonfläche im Grundriss.
// ============================================================

export type Maske = Uint8Array

export interface Box { minX: number; maxX: number; minY: number; maxY: number; minZ?: number; maxZ?: number }

/** Behält Punkte innerhalb des Quaders (nicht angegebene z-Grenzen = unbegrenzt) */
export function maskeBox(p: ArrayLike<number>, b: Box): Maske {
  const n = Math.floor(p.length / 3), m = new Uint8Array(n)
  const z0 = b.minZ ?? -Infinity, z1 = b.maxZ ?? Infinity
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    m[i] = x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= z0 && z <= z1 ? 1 : 0
  }
  return m
}

/**
 * Streupunkte entfernen: Ein Punkt bleibt, wenn in seiner Zelle samt Nachbarzellen (3×3×3) mindestens `minPunkte` Punkte liegen.
 * Dichte statt Abstand zum k-ten Nachbarn: schnell auch bei Millionen Punkten. Wirkt auf einzelne Ausreißer (Vögel, Staub, Spiegelungen),
 * nicht auf dünn besetzte, aber zusammenhängende Flächen – dafür `zelleM` größer wählen.
 */
export function maskeAusreisser(p: ArrayLike<number>, opt: { zelleM?: number; minPunkte?: number } = {}): Maske {
  const zelle = opt.zelleM ?? 0.3, minP = opt.minPunkte ?? 8
  const n = Math.floor(p.length / 3), m = new Uint8Array(n)
  if (n === 0) return m
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z
  }
  const nx = Math.floor((x1 - x0) / zelle) + 3, ny = Math.floor((y1 - y0) / zelle) + 3, nz = Math.floor((z1 - z0) / zelle) + 3
  const dicht = (nx * ny * nz <= 60_000_000)
  const schluessel = (gx: number, gy: number, gz: number): number => (gz * ny + gy) * nx + gx
  const zaehl = dicht ? new Uint32Array(nx * ny * nz) : null
  const karte = dicht ? null : new Map<number, number>()
  const zelleVon = (i: number): [number, number, number] => [Math.floor((p[i * 3] - x0) / zelle) + 1, Math.floor((p[i * 3 + 1] - y0) / zelle) + 1, Math.floor((p[i * 3 + 2] - z0) / zelle) + 1]
  const k0 = (gx: number, gy: number, gz: number): number => (dicht ? zaehl![schluessel(gx, gy, gz)] : karte!.get(schluessel(gx, gy, gz)) ?? 0)
  for (let i = 0; i < n; i++) {
    const [gx, gy, gz] = zelleVon(i), k = schluessel(gx, gy, gz)
    if (dicht) zaehl![k]++; else karte!.set(k, (karte!.get(k) ?? 0) + 1)
  }
  for (let i = 0; i < n; i++) {
    const [gx, gy, gz] = zelleVon(i)
    let s = 0
    for (let dz = -1; dz <= 1 && s < minP; dz++) for (let dy = -1; dy <= 1 && s < minP; dy++) for (let dx = -1; dx <= 1; dx++) s += k0(gx + dx, gy + dy, gz + dz)
    m[i] = s >= minP ? 1 : 0
  }
  return m
}

/** Alles über `zMax` weglassen (z. B. Antennen, Kräne, Bäume über dem Dach) */
export const maskeHoeheBis = (p: ArrayLike<number>, zMax: number): Maske => maskeBox(p, { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity, maxZ: zMax })

export const zaehleMaske = (m: Maske): number => { let s = 0; for (let i = 0; i < m.length; i++) s += m[i]; return s }

/** Maske auf Positionen und Farben (je 3 Werte je Punkt) anwenden; gleiche Längen bleiben gleich */
export function wendeMaskeAn<P extends Float32Array | Float64Array>(positionen: P, farben: Uint8Array, m: Maske): { positionen: P; farben: Uint8Array } {
  const k = zaehleMaske(m)
  const pos = new (positionen.constructor as new (n: number) => P)(k * 3), far = new Uint8Array(k * 3)
  let j = 0
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue
    pos[j * 3] = positionen[i * 3]; pos[j * 3 + 1] = positionen[i * 3 + 1]; pos[j * 3 + 2] = positionen[i * 3 + 2]
    far[j * 3] = farben[i * 3]; far[j * 3 + 1] = farben[i * 3 + 1]; far[j * 3 + 2] = farben[i * 3 + 2]
    j++
  }
  return { positionen: pos, farben: far }
}

// ─── Messen ──────────────────────────────────────────────────────────────────

export type P3 = [number, number, number]
export interface Strecke { raeumlichM: number; waagerechtM: number; hoeheM: number }

export function messeStrecke(a: P3, b: P3): Strecke {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  return { raeumlichM: Math.hypot(dx, dy, dz), waagerechtM: Math.hypot(dx, dy), hoeheM: Math.abs(dz) }
}

/** Fläche eines Polygons im Grundriss (Gauß'sche Trapezformel), unabhängig von der Umlaufrichtung; Umfang dazu */
export function messeFlaeche(eckpunkte: [number, number][]): { flaecheM2: number; umfangM: number } {
  const n = eckpunkte.length
  if (n < 3) return { flaecheM2: 0, umfangM: n === 2 ? Math.hypot(eckpunkte[1][0] - eckpunkte[0][0], eckpunkte[1][1] - eckpunkte[0][1]) : 0 }
  let a = 0, u = 0
  for (let i = 0; i < n; i++) {
    const [x1, y1] = eckpunkte[i], [x2, y2] = eckpunkte[(i + 1) % n]
    a += x1 * y2 - x2 * y1
    u += Math.hypot(x2 - x1, y2 - y1)
  }
  return { flaecheM2: Math.abs(a) / 2, umfangM: u }
}

/** Deutsche Schreibweise mit Komma, z. B. 12,35 m */
export const formatM = (v: number, stellen = 2): string => v.toFixed(stellen).replace('.', ',')

/** Anzeige-Punkte (Achse „oben“ und Einheit der Datei) → Meter mit z = oben */
export function anzeigeInMeterZOben(positionen: ArrayLike<number>, oben: 'x' | 'y' | 'z', faktor: number): Float64Array {
  const n = Math.floor(positionen.length / 3), aus = new Float64Array(n * 3)
  for (let i = 0; i < n; i++) {
    const x = positionen[i * 3] * faktor, y = positionen[i * 3 + 1] * faktor, z = positionen[i * 3 + 2] * faktor
    const [wx, wy, wz] = oben === 'z' ? [x, y, z] : oben === 'y' ? [x, z, y] : [y, z, x]
    aus[i * 3] = wx; aus[i * 3 + 1] = wy; aus[i * 3 + 2] = wz
  }
  return aus
}
