// ============================================================
// SCAFFOLD OS – Messpunkte aus GLB-Dreiecken für die Öffnungserkennung
//
// Die Dreiecke werden so ins Modell gelegt wie die Anzeige (Scaffold3D → EchtesGebaeude3D): Unterkante y = 0, bei
// zentriert = 'datei' bleibt der Datei-Ursprung, sonst Mitte der Box in x/z, dann Drehung um die Hochachse und Versatz.
// Auf den Flächen werden Punkte im Raster gesetzt; Türen und Fenster zeigen sich dann wie in einer Punktwolke als Lücken
// (oder als Rücksprung ab 6 cm) in der Fassade. Ein glatt durchmodellierte Wand ohne Loch ergibt keine Öffnung.
// ============================================================
export interface GlbPlatzierung { zentriert: 'datei' | 'geometrie'; versatzX?: number; versatzZ?: number; drehungGrad?: number }

export function punkteAusDreiecken(tris: ArrayLike<number>, p: GlbPlatzierung, maxPunkte = 4_000_000, farben?: ArrayLike<number>): { px: Float64Array; py: Float64Array; pz: Float64Array; farben?: Uint8Array } | null {
  const nt = Math.floor(tris.length / 9)
  if (nt < 1) return null
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity, flaeche = 0
  for (let t = 0; t < nt; t++) {
    const o = t * 9
    for (let k = 0; k < 3; k++) {
      const x = tris[o + k * 3], y = tris[o + k * 3 + 1], z = tris[o + k * 3 + 2]
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
    const ux = tris[o + 3] - tris[o], uy = tris[o + 4] - tris[o + 1], uz = tris[o + 5] - tris[o + 2]
    const vx = tris[o + 6] - tris[o], vy = tris[o + 7] - tris[o + 1], vz = tris[o + 8] - tris[o + 2]
    flaeche += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  const h = Math.max(0.03, Math.sqrt(flaeche / maxPunkte))
  const fx = p.zentriert === 'datei' ? 0 : (minX + maxX) / 2, fz = p.zentriert === 'datei' ? 0 : (minZ + maxZ) / 2
  const th = ((p.drehungGrad ?? 0) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th)
  const ox: number[] = [], oy: number[] = [], oz: number[] = [], of: number[] = []
  const setze = (x: number, y: number, z: number, cr = 0, cg = 0, cb = 0) => {
    const a = x - fx, b = z - fz
    if (farben) of.push(cr, cg, cb)
    ox.push(a * c + b * s + (p.versatzX ?? 0)); oy.push(-a * s + b * c + (p.versatzZ ?? 0)); oz.push(y - minY)
  }
  for (let t = 0; t < nt; t++) {
    const o = t * 9
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2]
    const ux = tris[o + 3] - ax, uy = tris[o + 4] - ay, uz = tris[o + 5] - az
    const vx = tris[o + 6] - ax, vy = tris[o + 7] - ay, vz = tris[o + 8] - az
    const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz)
    const nu = Math.max(1, Math.ceil(lu / h)), nv = Math.max(1, Math.ceil(lv / h))
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv - Math.floor((i * nv) / nu); j++) {
      const a = i / nu, b = j / nv
      if (a + b > 1 + 1e-9) continue
      const w0 = 1 - a - b
      const f = (k: number) => farben ? w0 * farben[o + k] + a * farben[o + 3 + k] + b * farben[o + 6 + k] : 0
      setze(ax + ux * a + vx * b, ay + uy * a + vy * b, az + uz * a + vz * b, f(0), f(1), f(2))
    }
    if (ox.length > maxPunkte * 1.5) break
  }
  return { px: Float64Array.from(ox), py: Float64Array.from(oy), pz: Float64Array.from(oz), ...(farben ? { farben: Uint8Array.from(of) } : {}) }
}
