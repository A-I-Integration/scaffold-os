import { describe, it, expect } from 'vitest'
import { punkteAusDreiecken } from '@/lib/cad/glb-oeffnungen'
import { erkenneOeffnungen } from '@/lib/cad/oeffnungen'

// Haus 12 × 8 × 6 m, Datei-Ursprung = Grundflächenmitte (glTF: x, y oben, z). Vorderwand (z = +4) mit Tür 1,0 × 2,1 bei x = 3,0 (nicht Mitte!)
function wand(z: number, loch?: { x0: number; x1: number; h: number }): number[] {
  const t: number[] = []
  // Wand in Streifen, damit eine Lücke entsteht
  const teile: [number, number, number, number][] = loch
    ? [[-6, 0, loch.x0, 6], [loch.x1, 0, 6, 6], [loch.x0, loch.h, loch.x1, 6]]
    : [[-6, 0, 6, 6]]
  for (const [x0, y0, x1, y1] of teile) t.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z)
  return t
}
function seite(x: number): number[] { return [x, 0, -4, x, 0, 4, x, 6, 4, x, 0, -4, x, 6, 4, x, 6, -4] }

describe('GLB-Öffnungen', () => {
  it('Tür außermittig an der Vorderseite wird mit Seite und Position gemessen', () => {
    const tris = [...wand(4, { x0: 2.5, x1: 3.5, h: 2.1 }), ...wand(-4), ...seite(-6), ...seite(6)]
    const pt = punkteAusDreiecken(tris, { zentriert: 'datei', versatzZ: -4.5 })!
    expect(pt).not.toBeNull()
    const r = erkenneOeffnungen(pt.px, pt.py, pt.pz, { lengthM: 12, widthM: 8, heightM: 6, sides: ['front', 'back', 'left', 'right'] })
    const tueren = r.oeffnungen.filter((o) => o.typ === 'tuer')
    expect(tueren).toHaveLength(1)
    expect(tueren[0].seite).toBe('front')
    expect(Math.abs(tueren[0].mitteM - 3)).toBeLessThanOrEqual(0.15)
  })
})
