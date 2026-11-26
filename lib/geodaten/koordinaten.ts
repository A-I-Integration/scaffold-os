// ============================================================
// SCAFFOLD OS – Koordinaten für Geodaten-Import (reine Funktionen, kein Netz)
// WGS84 → ETRS89/UTM (Zone 32 = EPSG:25832, Zone 33 = EPSG:25833) → lokales Meter-System des Gebäudes.
// Lokal: x = Ost, z = −Nord. Das passt zur CAD-Konvention (Rückseite = −z zeigt bei Nordrichtung 0° nach Norden,
// rechts = +x = Osten), siehe cad-engine.ts "front = +z, back = −z, left = −x, right = +x".
// ============================================================

export function utmZoneAusEpsg(epsg: number): 32 | 33 | null {
  return epsg === 25832 ? 32 : epsg === 25833 ? 33 : null
}

/** WGS84 → UTM (ETRS89, Meter) für die angegebene Zone (Transversal-Mercator-Reihe, Abweichung < 1 m in Deutschland). */
export function utmAusWgs84(lat: number, lon: number, zone: 32 | 33 = 32): { ost: number; nord: number } {
  const a = 6378137.0, f = 1 / 298.257222101, k0 = 0.9996
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const lon0 = zone * 6 - 183
  const p = (lat * Math.PI) / 180, l = ((lon - lon0) * Math.PI) / 180
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
  const T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2, A = l * Math.cos(p)
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p))
  const ost = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000
  const nord = k0 * (M + N * Math.tan(p) * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720))
  return { ost, nord }
}

/** UTM-Punkt → lokales System (x = Ost, z = −Nord) relativ zum Ursprung. */
export function lokalAusUtm(ost: number, nord: number, ursprung: { ost: number; nord: number }): { x: number; z: number } {
  return { x: ost - ursprung.ost, z: -(nord - ursprung.nord) }
}

/** Umkehrung: lokaler Punkt → UTM. */
export function utmAusLokal(x: number, z: number, ursprung: { ost: number; nord: number }): { ost: number; nord: number } {
  return { ost: ursprung.ost + x, nord: ursprung.nord - z }
}

export const abstandPunktStrecke = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
  const dx = bx - ax, dz = bz - az
  const l2 = dx * dx + dz * dz
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2))
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

export function punktInPolygon(px: number, pz: number, poly: { x: number; z: number }[]): boolean {
  let drin = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.z > pz) !== (b.z > pz) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) drin = !drin
  }
  return drin
}

/** Abstand eines Punkts zur Fläche (0 = innen). */
export function abstandZuPolygon(px: number, pz: number, poly: { x: number; z: number }[]): number {
  if (poly.length < 3) return Infinity
  if (punktInPolygon(px, pz, poly)) return 0
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    best = Math.min(best, abstandPunktStrecke(px, pz, a.x, a.z, b.x, b.z))
  }
  return best
}
