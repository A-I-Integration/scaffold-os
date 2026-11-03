import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../calculations/cad-engine'

const basis: BuildingParams = {
  lengthM: 20, widthM: 10, heightM: 20, eavesHeightM: 20, roofHeightM: 0, roofForm: 'flachdach',
  floors: 6, floorHeightsM: [3.33, 3.33, 3.33, 3.33, 3.34, 3.34], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'],
}
const modell = (sides: BuildingParams['sides']) => generateCADModel({ ...basis, sides }, 'layher-allround')

describe('Einfaches Gebäude: Fläche, Länge und Felder zählen alle gewählten Seiten', () => {
  it('eine Seite: wie bisher (Länge × Höhe)', () => {
    const m = modell(['front'])
    expect(m.totalAreaM2).toBeCloseTo(20 * 20, 2)
  })
  it('vorne und hinten: doppelte Fläche, Länge und Felder', () => {
    const e = modell(['front']), z = modell(['front', 'back'])
    expect(z.totalAreaM2).toBeCloseTo(2 * e.totalAreaM2, 2)
    expect(z.totalLengthM).toBeCloseTo(2 * e.totalLengthM, 2)
    expect(z.fieldCount).toBe(2 * e.fieldCount)
  })
  it('vier Seiten: links/rechts zählen mit der Gebäudebreite', () => {
    const m = modell(['front', 'back', 'left', 'right'])
    expect(m.totalAreaM2).toBeCloseTo((20 + 20 + 10 + 10) * 20, 2)
  })
  it('Fläche, Länge und Feldanzahl bleiben im Verhältnis (Durchschnittsfeldweite unverändert)', () => {
    const e = modell(['front']), v = modell(['front', 'back'])
    expect(v.totalLengthM / v.fieldCount).toBeCloseTo(e.totalLengthM / e.fieldCount, 3)
  })
  it('Feldanzahl passt zu den erzeugten Feldern je Lage', () => {
    const m = modell(['front', 'back', 'left', 'right'])
    const jeLage = m.fields.filter((f) => f.levelIndex === 0).length
    expect(m.fieldCount).toBe(jeLage)
  })
})
