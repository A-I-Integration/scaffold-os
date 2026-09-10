// ============================================================
// SCAFFOLD OS – Tests: CAD-Berechnungskern
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, calculateFieldDivision, calculateLevels, BuildingParams } from '../cad-engine'
import { GERUEST_SYSTEME } from '../geruest-systeme'

const STANDARD_BUILDING: BuildingParams = {
  lengthM: 15, widthM: 6, heightM: 10, eavesHeightM: 10,
  roofForm: 'satteldach', roofOverhangM: 0.3, roofHeightM: 2,
  floors: 3, floorHeightsM: [3, 3, 3], windowCount: 4, doorCount: 1, balconyCount: 0,
  overhangM: 0.3, setbackM: 0, sides: ['front'],
}

describe('calculateFieldDivision', () => {
  const system = GERUEST_SYSTEME.find((s) => s.id === 'layher-allround')!

  it('deckt die volle Gebäudelänge ab (Felder summieren sich mindestens auf die Länge)', () => {
    const { distribution } = calculateFieldDivision(15, system)
    const summe = distribution.reduce((s, f) => s + f, 0)
    expect(summe).toBeGreaterThanOrEqual(15 - 0.5) // letztes Feld darf leicht verkürzt sein
  })

  it('nutzt nur Feldlängen aus dem System-Katalog (außer beim ggf. verkürzten letzten Feld)', () => {
    const { distribution } = calculateFieldDivision(15, system)
    for (let i = 0; i < distribution.length - 1; i++) {
      expect(system.feldlangenM).toContain(distribution[i])
    }
  })

  it('liefert mindestens ein Feld auch bei sehr kurzer Länge', () => {
    const { fields } = calculateFieldDivision(1, system)
    expect(fields).toBeGreaterThanOrEqual(1)
  })
})

describe('calculateLevels', () => {
  const system = GERUEST_SYSTEME.find((s) => s.id === 'layher-allround')!

  it('deckt die volle Gebäudehöhe ab', () => {
    const { levelsData } = calculateLevels(10, system)
    const hoechsterPunkt = Math.max(...levelsData.map((l) => l.topY))
    expect(hoechsterPunkt).toBeGreaterThanOrEqual(10)
  })

  it('nutzt das Höhenraster des Systems je Lage', () => {
    const { levelsData } = calculateLevels(10, system)
    for (const l of levelsData) {
      expect(l.topY - l.bottomY).toBeCloseTo(system.rasterHoeheM, 5)
    }
  })
})

describe('generateCADModel + generateBillOfMaterials (Regelfall)', () => {
  it('erzeugt ein plausibles Modell für ein Standardgebäude', () => {
    const model = generateCADModel(STANDARD_BUILDING, 'layher-allround')
    expect(model.fieldCount).toBeGreaterThan(0)
    expect(model.levelCount).toBeGreaterThan(0)
    expect(model.components3D.length).toBeGreaterThan(0)
    expect(model.totalAreaM2).toBeGreaterThan(0)
  })

  it('erzeugt eine nicht-leere Stückliste mit positiven Preisen', () => {
    const model = generateCADModel(STANDARD_BUILDING, 'layher-allround')
    const materialien = generateBillOfMaterials(model)
    expect(materialien.length).toBeGreaterThan(0)
    for (const m of materialien) {
      expect(m.quantity).toBeGreaterThan(0)
      expect(m.totalPrice).toBeGreaterThanOrEqual(0)
    }
  })

  it('Gesamtfläche ändert sich sinnvoll mit der Gebäudelänge (doppelte Länge ≈ mehr Fläche)', () => {
    const klein = generateCADModel({ ...STANDARD_BUILDING, lengthM: 10 }, 'layher-allround')
    const gross = generateCADModel({ ...STANDARD_BUILDING, lengthM: 20 }, 'layher-allround')
    expect(gross.totalAreaM2).toBeGreaterThan(klein.totalAreaM2)
  })

  it('unbekannte System-ID führt nicht zum Absturz (system ist dann null, Modell trotzdem gültig)', () => {
    const model = generateCADModel(STANDARD_BUILDING, 'nicht-existierendes-system')
    expect(model.system).toBeNull()
    expect(model).toBeDefined()
  })
})
