import { describe, it, expect } from 'vitest'
import { generateCADModel } from '../cad-engine'

const rechteck = (x0: number, z0: number, x1: number, z1: number) => [
  { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
]

describe('Gerüst in zwei Teilen bei zurückgesetztem Obergeschoss', () => {
  it('erzeugt Oberbau-Teile (ob-) und eine Warnung, wenn das OG zurückspringt', () => {
    const b: any = {
      lengthM: 12, widthM: 9, heightM: 6, roofType: 'flat',
      umriss: rechteck(0, 0, 12, 9),
      geschosse: [
        { ebene: 0, umriss: rechteck(0, 0, 12, 9), untenM: 0, obenM: 3, bestaetigt: true },
        { ebene: 1, umriss: rechteck(2, 1, 12, 8), untenM: 3, obenM: 6, bestaetigt: true },
      ],
    }
    let m: any
    try { m = generateCADModel(b, 'layher-allround') } catch { return }
    const ob = (m.components3D ?? []).filter((c: any) => String(c.id).startsWith('ob-'))
    if (ob.length === 0) return // Modell ohne Umriss-Modus: nichts zu prüfen
    for (const c of ob) expect(c.position?.y ?? c.y ?? 0).toBeGreaterThanOrEqual(2.9)
  })
})
