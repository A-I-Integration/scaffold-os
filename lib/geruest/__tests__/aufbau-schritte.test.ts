import { describe, it, expect } from 'vitest'
import { generateCADModel, generateScaffoldComponents, type BuildingParams } from '@/lib/calculations/cad-engine'
import { erzeugeAufbauSchritte } from '../aufbau-schritte'

const haus: BuildingParams = {
  lengthM: 12, widthM: 9, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 3, floorHeightsM: [],
  windowCount: 4, doorCount: 1, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
}
function modell(b: BuildingParams = haus) {
  const m = generateCADModel(b, 'mj-uniconnect')
  return { ...m, components3D: generateScaffoldComponents(m) }
}

describe('Aufbau-Schritte', () => {
  it('ein Schritt je Lage, von unten nach oben, Belaghöhe steigt', () => {
    const m = modell()
    const s = erzeugeAufbauSchritte(m)
    expect(s.length).toBe(new Set(m.levels.map((l) => l.index)).size)
    s.forEach((x, i) => { expect(x.nr).toBe(i + 1); expect(x.von).toBe(s.length) })
    for (let i = 1; i < s.length; i++) expect(s[i].belagHoeheM).toBeGreaterThan(s[i - 1].belagHoeheM)
  })
  it('Schritt k blendet nur höhere Lagen aus; letzter Schritt blendet nichts aus', () => {
    const s = erzeugeAufbauSchritte(modell())
    expect(s[s.length - 1].versteckteLagen).toEqual([])
    expect(s[0].versteckteLagen.length).toBeGreaterThan(0)
    s[0].versteckteLagen.forEach((i) => expect(i).toBeGreaterThan(s[0].bisLageIndex))
  })
  it('Hinweise nennen Bauteilzahlen aus dem Modell und die Belaghöhe; erster Schritt die Fußpunkte', () => {
    const m = modell()
    const s = erzeugeAufbauSchritte(m)
    expect(s[0].hinweise.some((h) => /Fußpunkte/.test(h))).toBe(true)
    s.forEach((x) => expect(x.hinweise.some((h) => /Belag-Oberkante/.test(h))).toBe(true))
    const rahmen = m.components3D.filter((c) => c.type === 'frame' && m.levels.filter((l) => l.index === s[0].bisLageIndex).some((l) => l.id === c.levelId)).length
    expect(s[0].hinweise.some((h) => h.startsWith(`${rahmen} Rahmen`))).toBe(true)
  })
  it('ohne Gerüst keine Schritte', () => {
    const m = modell()
    expect(erzeugeAufbauSchritte({ ...m, levels: [], components3D: [] })).toEqual([])
  })
})
