import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const haus = (patch: Partial<BuildingParams> = {}): BuildingParams => ({
  lengthM: 12, widthM: 9, heightM: 9.2, eavesHeightM: 6.3, roofHeightM: 2.9, roofForm: 'satteldach',
  floors: 0, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.5, setbackM: 0,
  sides: ['front', 'back', 'left', 'right'], ...patch,
})
const lagen = (m: ReturnType<typeof generateCADModel>, side: string) => {
  const idx = m.fields.filter((f) => f.side === side).map((f) => f.levelIndex)
  return idx.length ? Math.max(...idx) + 1 : 0
}

describe('Satteldach: Traufseiten kürzer, Giebelseiten folgen dem Dreieck', () => {
  it('First entlang der Länge: vorne/hinten enden an der Traufe, links/rechts stufen sich bis zum First', () => {
    const m = generateCADModel(haus({ geruestOptionen: { feldlaengeM: 2.07 } }), 'layher-allround')
    const raster = m.levels[0].heightM
    const trauflagen = Math.ceil(6.3 / raster)
    expect(lagen(m, 'front')).toBe(trauflagen)
    expect(lagen(m, 'back')).toBe(trauflagen)
    expect(lagen(m, 'left')).toBe(Math.ceil(9.2 / raster))
    // Ecken der Giebelseite sind niedriger als die Mitte
    const links = m.fields.filter((f) => f.side === 'left' && f.levelIndex === Math.ceil(9.2 / raster) - 1)
    expect(links.length).toBeGreaterThan(0)
    expect(links.length).toBeLessThan(m.fields.filter((f) => f.side === 'left' && f.levelIndex === 0).length)
  })
  it('Fläche: Giebel = Rechteck + Dreieck, Traufseite = Länge × Traufe', () => {
    const m = generateCADModel(haus(), 'layher-allround')
    const soll = 2 * 12 * 6.3 + 2 * (9 * 6.3 + 0.5 * 9 * 2.9)
    expect(Math.abs(m.totalAreaM2 - soll)).toBeLessThan(0.01)
  })
  it('Ohne Dach-Angaben (Traufe = Höhe) bleibt alles wie bisher', () => {
    const m = generateCADModel(haus({ eavesHeightM: 9.2, roofHeightM: 0 }), 'layher-allround')
    expect(lagen(m, 'front')).toBe(m.levelCount)
    expect(lagen(m, 'left')).toBe(m.levelCount)
  })
  it('Breiter als lang: Giebel vorne/hinten', () => {
    const m = generateCADModel(haus({ lengthM: 8, widthM: 11 }), 'layher-allround')
    const raster = m.levels[0].heightM
    expect(lagen(m, 'left')).toBe(Math.ceil(6.3 / raster))
    expect(lagen(m, 'front')).toBe(Math.ceil(9.2 / raster))
  })
})
