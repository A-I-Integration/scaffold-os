// ============================================================
// SCAFFOLD OS – Gebäudehülle aus der angezeigten Punktwolke, im Koordinatensystem des CAD-Modells
//
// Die Anzeige des echten Gebäudes (PLY-Punktwolke) legt die Punkte so ins Modell: Einheit → Faktor, „oben“-Achse nach Y drehen,
// Box-Mitte (x, z) und Unterkante (y) in den Ursprung, dann Drehung um die Hochachse und Versatz. Dieselbe Abbildung steht hier,
// damit die Hülle genau dort liegt, wo die Person das Gebäude sieht (Scaffold3D → EchtesGebaeude3D).
// Nur für Punktwolken ohne Turm-Anker; Dateien mit Anker (OBJ-Turmschaft) und GLB liefern keine Hülle.
// ============================================================
import { netzAusPunktwolke, type PunktwolkeNetz, type PunktwolkeNetzOptionen } from '@/lib/cad/netz'

export interface HuellePlatzierung {
  faktor: number
  oben: 'x' | 'y' | 'z'
  versatzX?: number
  versatzZ?: number
  drehungGrad?: number
}

export function huelleAusAnzeigePunkten(positionen: ArrayLike<number>, p: HuellePlatzierung, opt: PunktwolkeNetzOptionen = {}): PunktwolkeNetz | null {
  const n = Math.floor(positionen.length / 3)
  if (n < 20) return null
  const f = p.faktor > 0 ? p.faktor : 1
  const ax = new Float64Array(n), ay = new Float64Array(n), az = new Float64Array(n)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < n; i++) {
    const x = positionen[i * 3] * f, y = positionen[i * 3 + 1] * f, z = positionen[i * 3 + 2] * f
    // three.js: oben = z → Drehung um x um −90° (x, z, −y); oben = x → Drehung um z um +90° (−y, x, z)
    const [wx, wy, wz] = p.oben === 'z' ? [x, z, -y] : p.oben === 'x' ? [-y, x, z] : [x, y, z]
    ax[i] = wx; ay[i] = wy; az[i] = wz
    if (wx < minX) minX = wx; if (wx > maxX) maxX = wx
    if (wy < minY) minY = wy
    if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz
  }
  const mx = (minX + maxX) / 2, mz = (minZ + maxZ) / 2
  const th = ((p.drehungGrad ?? 0) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th)
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const x = ax[i] - mx, z = az[i] - mz
    px[i] = x * c + z * s + (p.versatzX ?? 0)          // Drehung um Y wie three.js
    py[i] = -x * s + z * c + (p.versatzZ ?? 0)         // netzAusPunktwolke: py = waagerecht (wird zu z im Modell)
    pz[i] = ay[i] - minY                               // Höhe über der Unterkante
  }
  return netzAusPunktwolke(px, py, pz, { ...opt, bodenHoeheM: 0 })
}
