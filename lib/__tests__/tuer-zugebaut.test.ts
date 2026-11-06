import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

// Maße aus einem echten CAD-Projekt: 12 × 9 m Satteldach, Tür rechts mittig 1,20 × 2,10 m, System Layher Allround
const haus = (opt: BuildingParams['geruestOptionen'] = {}, tuer: Record<string, unknown> = {}): BuildingParams => ({
  lengthM: 12, widthM: 9, heightM: 9.2, eavesHeightM: 6.3, roofHeightM: 2.9, roofForm: 'satteldach', floors: 2, floorHeightsM: [],
  windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
  tueren: [{ id: 'portal-1', side: 'right', offsetAlongM: -0.01, widthM: 1.2, heightM: 2.1, ...tuer } as never],
  geruestOptionen: { breiteM: 1.09, ...opt },
})
/** Bauteile (ohne Fußplatten/Anker) im Türbereich der rechten Wand: Wand x = 6,5, Tür mittig bei z = −5,01, 1,20 m breit, 2,10 m hoch */
const imTuerbereich = (m: ReturnType<typeof generateCADModel>) => m.components3D.filter((c) => {
  const [x, y, z] = c.position
  return x > 6.45 && x < 7.8 && Math.abs(z + 5.01) < 0.6 && y < 2.1 && c.type !== 'footplate' && c.type !== 'load_plate' && c.type !== 'anchor'
})

describe('Türen freihalten aus: Gerüst läuft durch die Tür – das wird gemeldet', () => {
  it('aus: Belag steht in der Tür, Warnung TUER_ZUGEBAUT nennt die Zahl der Türen', () => {
    const m = generateCADModel(haus({ tuerenFreihalten: false }), 'layher-allround')
    expect(imTuerbereich(m).length).toBeGreaterThan(0)
    const w = m.warnings.find((x) => x.code === 'TUER_ZUGEBAUT')
    expect(w?.type).toBe('warning')
    expect(w?.message).toMatch(/^1 Tür\(en\) werden vom Gerüst überbaut/)
    expect(w?.message).not.toMatch(/nach außen/)
  })
  it('an (Standard): kein Bauteil in der Tür, keine Zugebaut-Warnung', () => {
    for (const opt of [{}, { tuerenFreihalten: true }]) {
      const m = generateCADModel(haus(opt), 'layher-allround')
      expect(imTuerbereich(m)).toEqual([])
      expect(m.warnings.some((x) => x.code === 'TUER_ZUGEBAUT')).toBe(false)
      expect(m.warnings.some((x) => x.code === 'TUER_DURCHGANG')).toBe(true)
    }
  })
  it('aus + Aufschlag nach außen: Warnung sagt, dass sich die Tür nicht öffnen lässt', () => {
    const m = generateCADModel(haus({ tuerenFreihalten: false }, { aufschlag: 'aussen' }), 'layher-allround')
    expect(m.warnings.find((x) => x.code === 'TUER_ZUGEBAUT')?.message).toMatch(/nach außen lässt sie sich auch nicht öffnen/)
  })
  it('aus, aber keine Tür im Gerüstbereich (Gerüst nur auf anderer Seite): keine Warnung', () => {
    const m = generateCADModel({ ...haus({ tuerenFreihalten: false }), sides: ['front'] }, 'layher-allround')
    expect(m.warnings.some((x) => x.code === 'TUER_ZUGEBAUT')).toBe(false)
  })
})
