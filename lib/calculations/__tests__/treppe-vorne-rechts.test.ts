import { describe, it, expect } from 'vitest'
import { generateCADModel, waehleVordereKante, feldRahmen, type BuildingParams } from '@/lib/calculations/cad-engine'
import { gelaendeProfilAusLinien } from '@/lib/cad/plan-oeffnungen-modell'
import plan from '@/lib/cad/__tests__/fixtures/plan-import-efh-hang.json'

const haupt = plan.geschosse.find((g) => g.ebene === plan.hauptEbene)!
const L = haupt.laengeM, W = haupt.breiteM
const form = [{ x: 0, z: 0 }, { x: L, z: 0 }, { x: L, z: W }, { x: L * 0.6, z: W }, { x: L * 0.6, z: W + 2 }, { x: L * 0.3, z: W + 2 }, { x: L * 0.3, z: W }, { x: 0, z: W }]
const drehe = (pts: typeof form, grad: number) => { const c = Math.cos((grad * Math.PI) / 180), s = Math.sin((grad * Math.PI) / 180); return pts.map((p) => ({ x: p.x * c - p.z * s, z: p.x * s + p.z * c })) }
const haus = (extra: Partial<BuildingParams>): BuildingParams => ({
  lengthM: L, widthM: W, heightM: 6.94, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
  roofForm: 'flachdach', sides: ['front', 'back', 'left', 'right'], ...extra,
}) as unknown as BuildingParams

describe('Treppe automatisch vorne rechts', () => {
  it('Rechteck: Vorderseite, zweites Feld von rechts', () => {
    const m = generateCADModel(haus({}), 'layher-allround')
    const stair = m.components3D.find((c) => c.id === 'stair-frame-0')!
    const reihe = m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0).sort((a, b) => b.positionX - a.positionX)
    expect(stair.position[0]).toBeCloseTo(reihe[1].positionX, 2)
    expect(stair.position[2]).toBeGreaterThan(reihe[1].positionZ)
  })
  for (const grad of [0, 30, 90, 180]) {
    it(`Umriss (Leithner-Plan mit Hang), ${grad}° gedreht: Treppe steht vor der am stärksten nach vorne zeigenden Kante, nicht an der längsten`, () => {
      const b = haus({ umriss: drehe(form, grad), geruestOptionen: { gelaendeProfilM: gelaendeProfilAusLinien(plan.gelaendeLinien as never, 'unten') } } as never)
      const m = generateCADModel(b, 'layher-allround')
      expect(m.warnings.some((w) => w.code === 'TREPPE_FEHLT')).toBe(false)
      const stair = m.components3D.find((c) => c.id === 'stair-frame-0')!
      expect(stair).toBeTruthy()
      // Außenrichtung der Treppe: das Feld an der Treppe schaut nach vorne (+z) – bei 0° eindeutig; gedreht schaut die Kante am stärksten nach +z
      const f = m.fields.filter((x) => x.kante !== undefined).sort((p, q) => Math.hypot(p.positionX - stair.position[0], p.positionZ - stair.position[2]) - Math.hypot(q.positionX - stair.position[0], q.positionZ - stair.position[2]))[0]
      const r = feldRahmen(f, m.building)
      const [ox, oz] = r.toWorld(0, 0), [nx, nz] = r.toWorld(0, 1)
      const nzNorm = (nz - oz) / Math.hypot(nx - ox, nz - oz)
      const maxNz = Math.max(...m.fields.filter((x) => x.kante !== undefined).map((x) => { const q = feldRahmen(x, m.building); const [a0, b0] = q.toWorld(0, 0), [a1, b1] = q.toWorld(0, 1); return (b1 - b0) / Math.hypot(a1 - a0, b1 - b0) }))
      expect(nzNorm).toBeGreaterThan(maxNz - 0.3)
      if (grad === 0) expect(nzNorm).toBeGreaterThan(0.9)
    })
  }
  it('waehleVordereKante: bei zwei Kanten nach vorne gewinnt die weiter rechts; nach hinten zeigende Kanten nie', () => {
    const teile = [
      { kante: 0, levelIndex: 0, lengthM: 4, x: -3, nz: 1 }, { kante: 1, levelIndex: 0, lengthM: 4, x: 4, nz: 1 },
      { kante: 2, levelIndex: 0, lengthM: 12, x: 0, nz: -1 }, { kante: 3, levelIndex: 0, lengthM: 8, x: 6, nz: 0 },
    ]
    expect(waehleVordereKante(teile)).toBe(1)
  })
  it('waehleVordereKante: zeigt keine Kante nach vorne, gilt die bisherige Regel (undefined)', () => {
    expect(waehleVordereKante([{ kante: 0, levelIndex: 0, lengthM: 6, x: 0, nz: -1 }, { kante: 1, levelIndex: 0, lengthM: 6, x: 0, nz: 0.1 }])).toBeUndefined()
    expect(waehleVordereKante([])).toBeUndefined()
  })
  it('waehleVordereKante: kurze Vorsprünge (unter 3 m) zählen nur, wenn es keine längere Kante gibt', () => {
    const teile = [{ kante: 0, levelIndex: 0, lengthM: 2, x: 8, nz: 1 }, { kante: 1, levelIndex: 0, lengthM: 8, x: 0, nz: 0.9 }]
    expect(waehleVordereKante(teile)).toBe(1)
  })
  it('manuell versetzbar: die automatische Treppe lässt sich per treppeFeldId auf ein anderes Feld legen', () => {
    const m = generateCADModel(haus({}), 'layher-allround')
    const reihe = m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0).sort((a, b) => a.positionX - b.positionX)
    const m2 = generateCADModel(haus({ geruestOptionen: { treppeFeldId: reihe[0].id } } as never), 'layher-allround')
    expect(m2.components3D.find((c) => c.id === 'stair-frame-0')!.position[0]).toBeCloseTo(reihe[0].positionX, 2)
  })
})
