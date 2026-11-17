// Gerüsthöhe je Umrisskante aus den bestätigten Geschossen: Wo über einer Kante kein höheres Geschoss steht (Rücksprung, Terrasse,
// niedrigerer Anbau), endet das Gerüst an der Oberkante des Geschosses, das dort an die Kante grenzt – nicht an der Gebäudehöhe.
import type { UmrissPunkt } from '@/lib/calculations/cad-umriss'

export interface GeschossHoehe { name: string; obenM: number; umriss: UmrissPunkt[] }

const LAGE_TOL_M = 0.15 // so weit darf die Geschosskante von der Umrisskante abweichen und gilt noch als dieselbe Wand
const MIN_UEBERLAPP_M = 0.5

/** Länge, auf der die Strecke c–d auf der Strecke a–b liegt (0, wenn sie nicht parallel/deckungsgleich ist). */
function ueberlappung(a: UmrissPunkt, b: UmrissPunkt, c: UmrissPunkt, d: UmrissPunkt): number {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz)
  if (l < 1e-6) return 0
  const ux = dx / l, uz = dz / l
  const quer = (p: UmrissPunkt) => Math.abs((p.x - a.x) * -uz + (p.z - a.z) * ux)
  if (quer(c) > LAGE_TOL_M || quer(d) > LAGE_TOL_M) return 0
  const t = (p: UmrissPunkt) => (p.x - a.x) * ux + (p.z - a.z) * uz
  const t0 = Math.max(0, Math.min(t(c), t(d))), t1 = Math.min(l, Math.max(t(c), t(d)))
  return Math.max(0, t1 - t0)
}

/**
 * Höhe je Kante des Hauptumrisses (gleiche Reihenfolge) oder null, wenn alle Kanten ohnehin bis zur Gebäudehöhe reichen
 * bzw. sich nichts ableiten lässt. Kanten, an die kein bestätigtes Geschoss grenzt, behalten die Gebäudehöhe.
 */
export function kantenHoehenAusGeschossen(umriss: UmrissPunkt[], geschosse: GeschossHoehe[], gebaeudeHoeheM: number): number[] | null {
  if (umriss.length < 3 || geschosse.length < 2) return null
  const hoechste = Math.max(...geschosse.map((g) => g.obenM))
  const h = umriss.map((a, i) => {
    const b = umriss[(i + 1) % umriss.length]
    let best = 0
    for (const g of geschosse) {
      const deckt = g.umriss.some((c, j) => ueberlappung(a, b, c, g.umriss[(j + 1) % g.umriss.length]) >= MIN_UEBERLAPP_M)
      if (deckt) best = Math.max(best, g.obenM)
    }
    if (best <= 0) return gebaeudeHoeheM
    return best >= hoechste - 1e-6 ? gebaeudeHoeheM : Math.min(best, gebaeudeHoeheM)
  })
  return h.every((v) => Math.abs(v - gebaeudeHoeheM) < 1e-6) ? null : h
}
