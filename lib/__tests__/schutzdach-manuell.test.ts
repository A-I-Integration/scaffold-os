import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../calculations/cad-engine'

const basis: BuildingParams = {
  lengthM: 20, widthM: 10, heightM: 20, eavesHeightM: 20, roofHeightM: 0, roofForm: 'flachdach',
  floors: 6, floorHeightsM: [3.33, 3.33, 3.33, 3.33, 3.34, 3.34], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
}
const daecher = (b: BuildingParams) => generateCADModel(b, 'layher-allround').components3D.filter((c) => c.type === 'protection_roof')

describe('Schutzdächer von Hand', () => {
  it('ohne Angabe bleibt die automatische Lage', () => {
    expect(daecher(basis).length).toBeGreaterThan(0)
  })
  it('leere Liste: keine Schutzdächer, nichts automatisch', () => {
    expect(daecher({ ...basis, geruestOptionen: { schutzdaecher: [] } })).toHaveLength(0)
  })
  it('ein Schutzdach: genau eines mit der angegebenen Länge und Höhe', () => {
    const d = daecher({ ...basis, geruestOptionen: { schutzdaecher: [{ seite: 'front', vonM: 3, laengeM: 5, hoeheM: 4.5 }] } })
    expect(d).toHaveLength(1)
    expect(d[0].scale[0]).toBeCloseTo(5, 2)
    expect(d[0].position[1]).toBeCloseTo(5, 2) // Unterkante 4,5 m + 0,5
  })
  it('mehrere Seiten: je Eintrag ein Schutzdach, Länge wird am Seitenende gekürzt', () => {
    const d = daecher({ ...basis, geruestOptionen: { schutzdaecher: [
      { seite: 'front', vonM: 0, laengeM: 4 },
      { seite: 'left', vonM: 0, laengeM: 3 },
      { seite: 'back', vonM: 18, laengeM: 10 },
    ] } })
    expect(d).toHaveLength(3)
    const laengen = d.map((x) => Math.round(x.scale[0] * 10) / 10).sort((a, b) => a - b)
    expect(laengen[0]).toBeLessThanOrEqual(3)
    expect(laengen[laengen.length - 1]).toBeCloseTo(4, 1)
  })
  it('Seite ohne Gerüst oder Länge 0 wird übersprungen', () => {
    const d = daecher({ ...basis, sides: ['front'], geruestOptionen: { schutzdaecher: [{ seite: 'back', vonM: 0, laengeM: 4 }, { seite: 'front', vonM: 0, laengeM: 0 }] } })
    expect(d).toHaveLength(0)
  })
})
