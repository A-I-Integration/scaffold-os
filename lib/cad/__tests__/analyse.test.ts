import { describe, it, expect } from 'vitest'
import { generateCADModel, generateScaffoldComponents } from '@/lib/calculations/cad-engine'
import { erzeugeAnalyse } from '../analyse'

const b: any = { lengthM: 12, widthM: 9, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 3, floorHeightsM: [], windowCount: 4, doorCount: 1, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'] }
describe('Analyse', () => {
  it('Kennzahlen stimmen mit dem Modell überein', () => {
    const m = generateCADModel(b, 'mj-uniconnect')
    const a = erzeugeAnalyse(m, 1000, 5000)
    const w = (l: string) => a.kennzahlen.find((k) => k.label === l)?.wert
    expect(w('Felder / Lagen')).toBe(`${m.fieldCount} / ${m.levelCount}`)
    expect(w('Anker')).toBe(String(m.anchors.length))
    expect(w('Gesamtgewicht')).toBe('1.000 kg')
    expect(a.bauteile.reduce((s, x) => s + x.anzahl, 0)).toBe(m.components3D.length)
  })
  it('Gewicht je m² nur bei Fläche > 0', () => {
    const m = { ...generateCADModel(b, 'mj-uniconnect'), totalAreaM2: 0 }
    expect(erzeugeAnalyse(m, 100, 100).kennzahlen.some((k) => k.label.includes('je m²'))).toBe(false)
  })
})
