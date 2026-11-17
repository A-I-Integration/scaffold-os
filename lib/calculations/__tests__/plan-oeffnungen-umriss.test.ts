import { describe, it, expect } from 'vitest'
import { generateBuildingFeatures, type BuildingParams } from '@/lib/calculations/cad-engine'

const basis = {
  lengthM: 10, widthM: 8, heightM: 6, eavesHeightM: 6, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [3, 3],
  windowCount: 4, doorCount: 1, balconyCount: 0, overhangM: 0, sides: ['front'], setbackM: 0,
  umriss: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }],
} as unknown as BuildingParams

describe('Fenster und Türen aus dem Plan im Umriss-Modus (synthetisch)', () => {
  it('Öffnungen an Umrisskanten werden dort gesetzt, die nächste Kante gilt, entfernte entfallen', () => {
    const b = { ...basis, planOeffnungen: [
      { ebene: 0, typ: 'tuer' as const, x: 5, z: 0.05, breiteM: 1 },
      { ebene: 0, typ: 'fenster' as const, x: 9.95, z: 4, breiteM: 1.2, bruestungM: 0.9, sturzM: 2.1 },
      { ebene: 1, typ: 'fenster' as const, x: 2, z: 7.9, breiteM: 1.2 },
      { ebene: 1, typ: 'fenster' as const, x: 5, z: 4, breiteM: 1.2 }, // mitten im Haus: keine Wand
    ] } as BuildingParams
    const f = generateBuildingFeatures(b)
    expect(f.length).toBe(3)
    expect(f.filter((x) => x.type === 'door').length).toBe(1)
    const fenster = f.filter((x) => x.type === 'window')
    expect(fenster.every((x) => x.umriss)).toBe(true)
    // Brüstung 0,9 m und Sturz 2,1 m → Fensterhöhe 1,2 m; OG-Fenster liegt über dem EG-Boden
    expect(fenster.find((x) => x.floorIndex === 0)!.heightM).toBeCloseTo(1.2, 2)
    expect(fenster.find((x) => x.floorIndex === 1)!.bottomY).toBeGreaterThan(3)
  })
  it('ohne Plan-Öffnungen oder wenn keine an eine Kante passt: wie bisher gleichmäßig verteilt', () => {
    const ohne = generateBuildingFeatures(basis)
    expect(ohne.length).toBeGreaterThan(0)
    const nurMitte = generateBuildingFeatures({ ...basis, planOeffnungen: [{ ebene: 0, typ: 'fenster' as const, x: 5, z: 4, breiteM: 1 }] } as BuildingParams)
    expect(nurMitte.length).toBe(ohne.length)
  })
})
