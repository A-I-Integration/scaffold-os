// ============================================================
// SCAFFOLD OS – Tests: CAD-Berechnungskern
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, calculateFieldDivision, calculateLevels, BuildingParams } from '../cad-engine'
import { GERUEST_SYSTEME } from '../geruest-systeme'

const STANDARD_BUILDING: BuildingParams = {
  lengthM: 15, widthM: 6, heightM: 10, eavesHeightM: 10,
  roofForm: 'satteldach', roofHeightM: 2,
  floors: 3, floorHeightsM: [3, 3, 3], windowCount: 4, doorCount: 1, balconyCount: 0,
  overhangM: 0.3, setbackM: 0, sides: ['front'],
}

describe('calculateFieldDivision', () => {
  const system = GERUEST_SYSTEME.find((s) => s.id === 'mj-uniconnect')!

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
  const system = GERUEST_SYSTEME.find((s) => s.id === 'mj-uniconnect')!

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
    const model = generateCADModel(STANDARD_BUILDING, 'mj-uniconnect')
    expect(model.fieldCount).toBeGreaterThan(0)
    expect(model.levelCount).toBeGreaterThan(0)
    expect(model.components3D.length).toBeGreaterThan(0)
    expect(model.totalAreaM2).toBeGreaterThan(0)
  })

  it('erzeugt eine nicht-leere Stückliste mit positiven Preisen', () => {
    const model = generateCADModel(STANDARD_BUILDING, 'mj-uniconnect')
    const materialien = generateBillOfMaterials(model)
    expect(materialien.length).toBeGreaterThan(0)
    for (const m of materialien) {
      expect(m.quantity).toBeGreaterThan(0)
      expect(m.totalPrice).toBeGreaterThanOrEqual(0)
    }
  })

  it('Gesamtfläche ändert sich sinnvoll mit der Gebäudelänge (doppelte Länge ≈ mehr Fläche)', () => {
    const klein = generateCADModel({ ...STANDARD_BUILDING, lengthM: 10 }, 'mj-uniconnect')
    const gross = generateCADModel({ ...STANDARD_BUILDING, lengthM: 20 }, 'mj-uniconnect')
    expect(gross.totalAreaM2).toBeGreaterThan(klein.totalAreaM2)
  })

  it('unbekannte System-ID führt nicht zum Absturz (system ist dann null, Modell trotzdem gültig)', () => {
    const model = generateCADModel(STANDARD_BUILDING, 'nicht-existierendes-system')
    expect(model.system).toBeNull()
    expect(model).toBeDefined()
  })
})

describe('Dachrand-Absturzschutz (Flachdach)', () => {
  const FLACH: BuildingParams = { ...STANDARD_BUILDING, roofForm: 'flachdach', roofHeightM: 0, heightM: 6, eavesHeightM: 6, floors: 2, floorHeightsM: [3, 3], sides: ['front', 'back', 'left', 'right'] }
  const dachrand = (m: ReturnType<typeof generateCADModel>) => m.components3D.filter((c) => c.id.startsWith('dachrand-'))

  it('ohne Schalter entstehen keine Dachrand-Teile', () => {
    expect(dachrand(generateCADModel(FLACH, 'mj-uniconnect'))).toHaveLength(0)
  })

  it('mit Schalter: nur oberste Lage, Handlauf endet 1,0 m über Dachkante', () => {
    const m = generateCADModel({ ...FLACH, dachrandSchutz: true }, 'mj-uniconnect')
    const teile = dachrand(m)
    expect(teile.length).toBeGreaterThan(0)
    const obersteLage = Math.max(...m.levels.map((l) => l.index))
    for (const t of teile) {
      const feld = m.fields.find((f) => f.id === t.id.replace('dachrand-', '').replace(/-pfosten-[lr]$/, ''))
      expect(feld?.levelIndex).toBe(obersteLage)
    }
    const gelaender = teile.filter((c) => !c.id.includes('-pfosten-'))
    for (const g of gelaender) expect(g.position[1] + g.scale[1] / 2).toBeCloseTo(FLACH.heightM + 1.0, 5)
    // zwei Pfosten je Gelaender
    expect(teile.length).toBe(gelaender.length * 3)
  })

  it('nicht bei Satteldach', () => {
    const m = generateCADModel({ ...FLACH, roofForm: 'satteldach', dachrandSchutz: true }, 'mj-uniconnect')
    expect(dachrand(m)).toHaveLength(0)
  })

  it('verändert sonst nichts am Modell (alle anderen Bauteile identisch)', () => {
    const a = generateCADModel(FLACH, 'mj-uniconnect').components3D
    const b = generateCADModel({ ...FLACH, dachrandSchutz: true }, 'mj-uniconnect').components3D.filter((c) => !c.id.startsWith('dachrand-'))
    expect(b).toEqual(a)
  })
})

describe('Fassadenanalyse im Rechteck-Modus', () => {
  it('berechnet bestätigte Geschosskonturen auch ohne Gebäude-Umriss', () => {
    const rect = (x0: number, z0: number, x1: number, z1: number) => [
      { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
    ]
    const model = generateCADModel({
      ...STANDARD_BUILDING,
      fassadenGeschosse: [
        { name: 'EG', obenM: 3, umriss: rect(0, 0, 12, 10) },
        { name: 'OG', obenM: 6, umriss: rect(2, 2, 10, 8) },
      ],
    }, 'mj-uniconnect')

    expect(model.fassadenFlaechen).toBeDefined()
    expect(model.fassadenFlaechen!.length).toBeGreaterThan(0)
    expect(model.fassadenAbschnitte).toBeDefined()
    expect(model.fassadenAbschnitte!.length).toBeGreaterThan(0)
    expect(model.warnings.some((w) => w.code === 'FASSADEN_ANALYSE')).toBe(true)
    // Die Fassadenanalyse darf die bestehende Gerüst-Feldberechnung nicht verändern.
    const ohneFassaden = generateCADModel(STANDARD_BUILDING, 'mj-uniconnect')
    expect(model.fields).toEqual(ohneFassaden.fields)
  })
})

describe('Flachdach: oberster Belag mindestens 1 m unter der Dachkante', () => {
  const system = GERUEST_SYSTEME.find((s) => s.id === 'mj-uniconnect')!
  const FLACH = (h: number): BuildingParams => ({ ...STANDARD_BUILDING, roofForm: 'flachdach', roofHeightM: 0, heightM: h, eavesHeightM: h, floors: 2, floorHeightsM: [h / 2, h / 2], sides: ['front'] })
  const obenM = (m: ReturnType<typeof generateCADModel>) => Math.max(...m.levels.map((l) => l.topY))

  it('calculateLevels mit Abstand: abrunden, mindestens eine Lage', () => {
    expect(calculateLevels(7, system, 0, 1).levels).toBe(3)
    expect(calculateLevels(7, system, 0, 1).levelsData.at(-1)!.topY).toBe(6)
    expect(calculateLevels(8, system, 0, 1).levels).toBe(3) // 8 − 1 = 7 → 3 Lagen (Belag 6 m)
    expect(calculateLevels(9, system, 0, 1).levels).toBe(4) // 9 − 1 = 8 → Belag genau 8 m
    expect(calculateLevels(2.5, system, 0, 1).levels).toBe(1) // nie weniger als eine Lage
  })
  it('ohne Abstand bleibt das Aufrunden wie bisher', () => {
    expect(calculateLevels(7, system).levels).toBe(4)
    expect(calculateLevels(7, system).levelsData.at(-1)!.topY).toBe(8)
  })
  it('Modell Flachdach 7 m: 3 Lagen, oberster Belag 6 m (nicht 8 m)', () => {
    const m = generateCADModel(FLACH(7), 'mj-uniconnect')
    expect(m.levelCount).toBe(3)
    expect(obenM(m)).toBe(6)
  })
  it('Allgemeine Regel: oberster Belag liegt bei jeder Flachdach-Höhe höchstens Gebäudehöhe − 1 m', () => {
    for (const h of [3.2, 4, 5.5, 6, 7, 8, 9.5, 12, 15.3]) {
      const m = generateCADModel(FLACH(h), 'mj-uniconnect')
      expect(obenM(m)).toBeLessThanOrEqual(Math.max(system.rasterHoeheM, h - 1) + 1e-6)
    }
  })
  it('Satteldach bleibt unverändert (Rinnen-Regel)', () => {
    const sattel: BuildingParams = { ...STANDARD_BUILDING, roofForm: 'satteldach', heightM: 10, eavesHeightM: 8, roofHeightM: 2, sides: ['front'] }
    const m = generateCADModel(sattel, 'mj-uniconnect')
    expect(obenM(m)).toBeGreaterThanOrEqual(8)
  })
})
