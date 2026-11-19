import { describe, it, expect } from 'vitest'
import { generateCADModel, addManualPlacement, type BuildingParams, type ManualPlacement } from '@/lib/calculations/cad-engine'
import { rastePlatzierung } from '@/lib/cad/platzieren'
import { findeVerbindungen } from '@/lib/cad/anschluesse'

const haus: BuildingParams = { lengthM: 12, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [4, 4], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'], geruestOptionen: { treppe: false } }
const m = generateCADModel(haus, 'layher-allround')
const pl = (type: ManualPlacement['type'], x: number, y: number, z: number): ManualPlacement => ({ id: 'manual-t', type, positionX: x, positionY: y, positionZ: z, side: 'front', levelIndex: 0 })

describe('Einrasten beim Setzen', () => {
  it('Treppe und Gerüstfeld bleiben unverändert (eigene Feldlogik)', () => {
    expect(rastePlatzierung(m, pl('stair', 1, 1, 1))).toEqual(pl('stair', 1, 1, 1))
    expect(rastePlatzierung(m, pl('geruestfeld', 1, 1, 1))).toEqual(pl('geruestfeld', 1, 1, 1))
  })
  it('Leiter nahe an einem Rahmen: wird versetzt, bleibt aber höchstens im Einrastradius; ohne Anschluss in der Nähe unverändert', () => {
    const f = m.components3D.find((c) => c.type === 'frame')!
    const nah = pl('ladder', f.position[0] + 0.05, f.position[1], f.position[2] + 0.05)
    const r = rastePlatzierung(m, nah)
    expect(Math.hypot(r.positionX - nah.positionX, r.positionY - nah.positionY, r.positionZ - nah.positionZ)).toBeLessThanOrEqual(0.15 + 1e-9)
    const weit = pl('ladder', 40, 40, 40)
    expect(rastePlatzierung(m, weit)).toEqual(weit)
  })
  it('Ergebnis lässt sich ganz normal bauen (keine Änderung der Teilezahl durch das Einrasten)', () => {
    const f = m.components3D.find((c) => c.type === 'frame')!
    const nah = pl('ladder', f.position[0] + 0.04, f.position[1], f.position[2])
    const a = addManualPlacement(m, nah), b = addManualPlacement(m, rastePlatzierung(m, nah))
    expect(b.components3D.length).toBe(a.components3D.length)
    expect(findeVerbindungen(b.components3D).length).toBeGreaterThanOrEqual(findeVerbindungen(a.components3D).length)
  })
})
