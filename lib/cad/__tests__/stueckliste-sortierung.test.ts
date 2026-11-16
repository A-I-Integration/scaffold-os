import { describe, it, expect } from 'vitest'
import { sortiereStueckliste } from '@/lib/cad/stueckliste-sortierung'
import { generateCADModel, generateBillOfMaterials, type BuildingParams } from '@/lib/calculations/cad-engine'

const m = generateCADModel({ lengthM: 13.8, widthM: 8.85, heightM: 6.94, eavesHeightM: 5.92, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'pultdach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: true } } as unknown as BuildingParams, 'layher-allround')
const bom = generateBillOfMaterials(m)
const alle = (r: [string, { articleNumber: string; quantity: number }[]][]) => r.flatMap(([, z]) => z)

describe('Stückliste sortieren', () => {
  for (const modus of ['gruppen', 'az', 'unten'] as const) {
    it(`${modus}: keine Position geht verloren oder doppelt, Summe der Mengen bleibt`, () => {
      const a = alle(sortiereStueckliste(bom, modus))
      expect(a).toHaveLength(bom.length)
      expect(a.reduce((s, z) => s + z.quantity, 0)).toBe(bom.reduce((s, z) => s + z.quantity, 0))
      expect(new Set(a.map((z) => z.articleNumber)).size).toBe(bom.length)
    })
  }
  it('A–Z: eine Liste, nach Name aufsteigend', () => {
    const r = sortiereStueckliste(bom, 'az')
    expect(r).toHaveLength(1)
    const n = r[0][1].map((z) => z.name)
    expect(n).toEqual([...n].sort((a, b) => a.localeCompare(b, 'de')))
  })
  it('Von unten: Fundamente vor Rahmen vor Belag vor Geländer, Treppen nach den Geländern', () => {
    const g = sortiereStueckliste(bom, 'unten').map(([k]) => k)
    const i = (k: string) => g.indexOf(k)
    for (const [a, b] of [['Fundamente', 'Rahmen'], ['Rahmen', 'Belag'], ['Belag', 'Geländer'], ['Geländer', 'Treppen']]) if (i(a) >= 0 && i(b) >= 0) expect(i(a)).toBeLessThan(i(b))
  })
  it('Gruppen: Reihenfolge wie bisher (Ersterscheinung)', () => {
    expect(sortiereStueckliste(bom, 'gruppen').map(([k]) => k)).toEqual([...new Set(bom.map((z) => z.category))])
  })
})
