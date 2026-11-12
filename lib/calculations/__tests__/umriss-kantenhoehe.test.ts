import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../cad-engine'
import { kantenHoehenNormalisiert } from '../cad-umriss'

// L-förmiger Grundriss: Hauptbau 12 x 8 m, Anbau (Garage) 6 x 5 m niedriger
const umriss = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 8 }, { x: 6, z: 8 }, { x: 6, z: 13 }, { x: 0, z: 13 }]

describe('Umriss: eigene Höhe je Kante', () => {
  it('ordnet die Höhen bei umgedrehtem Umlauf richtig zu', () => {
    const h = [9, 9, 9, 4, 4, 4]
    const n = kantenHoehenNormalisiert(umriss, h)
    expect(n).not.toBeNull()
    expect(n!.length).toBe(6)
    expect([...n!].sort()).toEqual([...h].sort())
  })
  it('lehnt falsche Längen ab', () => {
    expect(kantenHoehenNormalisiert(umriss, [9, 9])).toBeNull()
  })
  it('niedrige Kanten bekommen weniger Lagen als hohe', () => {
    const b = {
      lengthM: 12, widthM: 13, heightM: 9, eavesHeightM: 9, roofHeightM: 0, roofForm: 'flachdach', floors: 3, floorHeightsM: [],
      windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
      umriss, umrissKantenHoeheM: [9, 9, 9, 3, 3, 3], geruestOptionen: { feldlaengeM: 2.07 },
    } as BuildingParams
    const m = generateCADModel(b, 'layher-allround')
    const jeKante = new Map<number, number>()
    m.fields.forEach((f) => { if (f.kante !== undefined) jeKante.set(f.kante, Math.max(jeKante.get(f.kante) ?? -1, f.levelIndex)) })
    const werte = [...jeKante.values()]
    expect(Math.max(...werte)).toBeGreaterThan(Math.min(...werte))
    expect(m.warnings.some((w) => w.code === 'UMRISS_KANTENHOEHEN')).toBe(true)
  })
})

describe('Umriss mit gerader Kante, an der sich die Höhe ändert', () => {
  it('liefert ein Gerüst ohne Fehler und mit beiden Höhen', () => {
    const u = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 6, z: 8 }, { x: 6, z: 13 }, { x: 0, z: 13 }, { x: 0, z: 8 }]
    const b = {
      lengthM: 10, widthM: 13, heightM: 6, eavesHeightM: 6, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [],
      windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
      umriss: u, umrissKantenHoeheM: [6, 6, 6, 3, 3, 3, 6], geruestOptionen: { feldlaengeM: 2.07 },
    } as BuildingParams
    const m = generateCADModel(b, 'layher-allround')
    expect(m.warnings.filter((w) => w.type === 'error')).toEqual([])
    expect(m.fields.length).toBeGreaterThan(0)
    const lagen = new Set(m.fields.map((f) => f.levelIndex))
    expect(lagen.size).toBeGreaterThan(1)
  })
})
