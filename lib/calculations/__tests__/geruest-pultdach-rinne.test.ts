import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const rechteck = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
const basis = {
  lengthM: 12, widthM: 9, heightM: 6.94, eavesHeightM: 5.92, roofHeightM: 1.02, roofForm: 'pultdach', floors: 2, floorHeightsM: [2.95, 2.97],
  windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0.3, sides: ['front'],
  umriss: rechteck(0, 0, 12, 9),
  fassadenGeschosse: [
    { name: 'EG', obenM: 2.95, umriss: rechteck(0, 0, 12, 9) },
    { name: 'OG', obenM: 5.92, umriss: rechteck(1.5, 0, 10.5, 9) },
  ],
} as unknown as BuildingParams

const oberkante = (m: ReturnType<typeof generateCADModel>) => Math.max(...m.components3D.map((c: any) => (c.position?.[1] ?? 0) + (c.size?.[1] ?? c.height ?? 0) / 2))

describe('Gerüst bei Pultdach mit bestätigten Geschossen', () => {
  it('endet an der Rinne, nicht an der Firsthöhe', () => {
    const m = generateCADModel(basis, 'layher-allround')
    expect(m.warnings.some((w) => w.code === 'OBERSTER_BELAG_RINNE')).toBe(true)
    expect(oberkante(m)).toBeLessThan(6.94 + 1.2)
  })
})
