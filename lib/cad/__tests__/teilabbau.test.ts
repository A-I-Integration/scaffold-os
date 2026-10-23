import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../../calculations/cad-engine'
import { berechneTeilabbau } from '../teilabbau'

const turm: BuildingParams = {
  lengthM: 8, widthM: 8, heightM: 32, eavesHeightM: 32, roofHeightM: 0, roofForm: 'flachdach',
  floors: 8, floorHeightsM: [4, 4, 4, 4, 4, 4, 4, 4], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
}
const m = generateCADModel(turm, 'layher-allround')
const opt = { gesamtAbbauStunden: 100 }

describe('Teilabbau', () => {
  it('oberste Lagen: Anteil, Stunden, Schritte von oben nach unten', () => {
    const e = berechneTeilabbau(m, { art: 'lagen', anzahl: 2 }, { ...opt, personen: 4 })
    expect(e.anzahlTeile).toBeGreaterThan(0)
    expect(e.anzahlTeile).toBeLessThan(m.components3D.length)
    expect(e.anteil).toBeGreaterThan(0)
    expect(e.anteil).toBeLessThan(0.5)
    expect(e.stunden).toBe(Math.ceil(100 * e.anteil))
    expect(e.tage).toBe(Math.ceil(e.stunden / (4 * 8)))
    expect(e.schritte).toHaveLength(2)
    expect(e.schritte[0].lage).toBeGreaterThan(e.schritte[1].lage)
    expect(e.material.length).toBeGreaterThan(0)
  })
  it('Fläche: nimmt ganze Lagen von oben, bis die m² erreicht sind', () => {
    const e = berechneTeilabbau(m, { art: 'flaeche', m2: 50 }, opt)
    expect(e.flaecheM2).toBeGreaterThanOrEqual(50)
    expect(e.annahmen.join(' ')).toContain('ganze Lagen')
    const mehr = berechneTeilabbau(m, { art: 'flaeche', m2: 150 }, opt)
    expect(mehr.stunden).toBeGreaterThan(e.stunden)
  })
  it('Teile: genau N Bauteile, die obersten zuerst', () => {
    const e = berechneTeilabbau(m, { art: 'teile', anzahl: 10 }, opt)
    expect(e.anzahlTeile).toBe(10)
    const hoechstes = Math.max(...m.components3D.map((c) => c.position[1]))
    expect(m.components3D.filter((c) => e.bauteilIds.includes(c.id)).some((c) => c.position[1] === hoechstes)).toBe(true)
  })
  it('Klick/IDs: nur die gewählten Teile', () => {
    const ids = m.components3D.slice(0, 5).map((c) => c.id)
    const e = berechneTeilabbau(m, { art: 'ids', ids }, opt)
    expect(e.bauteilIds).toEqual(ids)
    expect(e.anzahlTeile).toBe(5)
  })
  it('Stunden von Hand überschreiben die Berechnung und bestimmen die Tage', () => {
    const e = berechneTeilabbau(m, { art: 'lagen', anzahl: 2 }, { ...opt, personen: 2, stundenHand: 40 })
    expect(e.stunden).toBe(40)
    expect(e.stundenBerechnet).not.toBe(40)
    expect(e.tage).toBe(3) // 40 h / (2 × 8 h)
  })
  it('alles abbauen = ganze Abbaustunden; nichts gewählt = 0', () => {
    const alle = berechneTeilabbau(m, { art: 'lagen', anzahl: 999 }, opt)
    expect(alle.anteil).toBeCloseTo(1, 5)
    expect(alle.stunden).toBe(100)
    const keine = berechneTeilabbau(m, { art: 'ids', ids: [] }, opt)
    expect(keine.stunden).toBe(0)
    expect(keine.tage).toBe(0)
  })
})
