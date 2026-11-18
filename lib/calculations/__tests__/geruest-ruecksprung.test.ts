import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const r = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
const basis = {
  lengthM: 14, widthM: 9, heightM: 6, eavesHeightM: 6, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [3, 3],
  windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, sides: ['front', 'left', 'back', 'right'], setbackM: 0,
  umriss: r(0, 0, 14, -9),
} as unknown as BuildingParams
const hoechsteOkAn = (m: ReturnType<typeof generateCADModel>) => Math.max(...m.components3D.filter((c) => c.type === 'deck').map((c) => c.position[1]))

describe('Gerüst folgt dem Rücksprung (synthetisch)', () => {
  const mit = { ...basis, fassadenGeschosse: [{ name: 'EG', obenM: 3, umriss: r(0, 0, 14, -9) }, { name: 'OG', obenM: 6, umriss: r(2, 0, 12, -9) }] } as unknown as BuildingParams
  it('Schmalseiten ohne OG darüber enden niedriger: weniger Belagteile als bei durchgehend voller Höhe', () => {
    const voll = generateCADModel(basis, 'layher-allround')
    const stufig = generateCADModel(mit, 'layher-allround')
    // Oberbau-Teile (Präfix ob-) gehören zum zweiten Gerüstteil und zählen hier nicht mit
    const ring = (m: typeof voll) => m.components3D.filter((c) => c.type === 'deck' && !String(c.id).startsWith('ob-')).length
    expect(ring(stufig)).toBeLessThan(ring(voll))
    expect(stufig.warnings.some((w) => w.code === 'UMRISS_KANTENHOEHEN')).toBe(true)
    expect(hoechsteOkAn(stufig)).toBeGreaterThan(5) // Längsseiten reichen weiter bis zum OG
  })
  it('ohne Rücksprung (OG deckt alle Kanten) bleibt das Gerüst unverändert', () => {
    const gleich = { ...basis, fassadenGeschosse: [{ name: 'EG', obenM: 3, umriss: r(0, 0, 14, -9) }, { name: 'OG', obenM: 6, umriss: r(0, 0, 14, -9) }] } as unknown as BuildingParams
    const a = generateCADModel(basis, 'layher-allround'), b = generateCADModel(gleich, 'layher-allround')
    expect(b.components3D.length).toBe(a.components3D.length)
  })
})
