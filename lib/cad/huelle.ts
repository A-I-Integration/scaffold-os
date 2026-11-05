// ============================================================
// SCAFFOLD OS – Gebäudehülle aus der angezeigten Punktwolke, im Koordinatensystem des CAD-Modells
//
// Die Anzeige des echten Gebäudes (PLY-Punktwolke) legt die Punkte so ins Modell: Einheit → Faktor, „oben“-Achse nach Y drehen,
// Box-Mitte (x, z) und Unterkante (y) in den Ursprung, dann Drehung um die Hochachse und Versatz. Dieselbe Abbildung steht hier,
// damit die Hülle genau dort liegt, wo die Person das Gebäude sieht (Scaffold3D → EchtesGebaeude3D).
// Nur für Punktwolken ohne Turm-Anker; Dateien mit Anker (OBJ-Turmschaft) und GLB liefern keine Hülle.
// ============================================================
import { netzAusPunktwolke, netzVolumenM3, type PunktwolkeNetz, type PunktwolkeNetzOptionen } from '@/lib/cad/netz'

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

// ─── Kappen auf Höhe ─────────────────────────────────────────────────────────

export interface KappenErgebnis {
  gesamt: PunktwolkeNetz
  gekappt: PunktwolkeNetz
  hoeheM: number
  gesamtHoeheM: number
  volumenGesamtM3: number
  volumenUntenM3: number
  volumenObenM3: number
}

/**
 * Schneidet die Gebäudehülle auf `hoeheM` über der Unterkante ab und liefert die Volumen unten und oben.
 * Die Hülle besteht aus Höhensäulen; das Kappen ist deshalb exakt (Säulenhöhe begrenzen), ohne Netzschnitt und ohne Größenlimit.
 * Das Volumen ist das der vereinfachten Hülle (Raster), nicht das des echten Gebäudes.
 */
export function kappeHuelle(positionen: ArrayLike<number>, p: HuellePlatzierung, hoeheM: number, opt: PunktwolkeNetzOptionen = {}): KappenErgebnis | null {
  const gesamt = huelleAusAnzeigePunkten(positionen, p, opt)
  if (!gesamt || !(hoeheM > 0)) return null
  const gekappt = huelleAusAnzeigePunkten(positionen, p, { ...opt, kappeHoeheM: hoeheM })
  if (!gekappt) return null
  let hMax = 0
  for (let i = 1; i < gesamt.netz.punkte.length; i += 3) if (gesamt.netz.punkte[i] > hMax) hMax = gesamt.netz.punkte[i]
  const vg = netzVolumenM3(gesamt.netz), vu = netzVolumenM3(gekappt.netz)
  return { gesamt, gekappt, hoeheM, gesamtHoeheM: hMax, volumenGesamtM3: vg, volumenUntenM3: vu, volumenObenM3: Math.max(0, vg - vu) }
}
