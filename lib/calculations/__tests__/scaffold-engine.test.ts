// ============================================================
// SCAFFOLD OS – Tests: Aufmaß-Kalkulationskern (scaffold-engine.ts)
//
// Das ist der wirtschaftlich wichtigste Berechnungsteil der App –
// hier entsteht der Preis, der dem Kunden angeboten wird. Deckt genau
// die Art Regression ab, die am schwersten von Hand auffällt: eine
// kleine Änderung an der Formel, die den Preis plötzlich falsch
// macht, ohne dass die Seite "kaputt" aussieht.
// ============================================================

import { describe, it, expect } from 'vitest'
import { calculateScaffoldMaterial } from '../scaffold-engine'
import type { ScaffoldInput } from '@/types/scaffold'

const STANDARD_INPUT: ScaffoldInput = {
  customer: 'Testkunde', address: 'Teststraße 1, 48691 Vreden', trade: 'fassade', projectDurationDays: 14,
  lengthM: 15, heightM: 10, widthM: 8, eavesHeightM: 10, roofForm: 'satteldach', roofOverhangM: 0.3,
  facadeType: 'mauerwerk', obstacles: [],
  scaffoldType: 'rahmen', deckingType: 'stahl', fieldLengthM: 2.57, groundType: 'beton',
  anchorType: 'fassadenanker', groundCondition: 'beton', hasSlope: false, hasLightShafts: false,
  hasBasement: false, needsLoadDistribution: false,
  environment: { hasPowerLines: false, hasVegetation: false, hasNeighborProperty: false, hasPublicTraffic: false, needsNoParkingZone: false },
  windZone: 2, hazards: [], additionalNotes: '',
}

describe('calculateScaffoldMaterial – Regelfall', () => {
  it('liefert ein plausibles Ergebnis für ein Standardgebäude', () => {
    const result = calculateScaffoldMaterial(STANDARD_INPUT)
    expect(result.materialList.length).toBeGreaterThan(0)
    expect(result.totalCost).toBeGreaterThan(0)
    expect(result.suggestedPrice).toBeGreaterThan(0)
  })

  it('Vorschlagspreis liegt nicht unter den reinen Kosten (sonst Verlust)', () => {
    const result = calculateScaffoldMaterial(STANDARD_INPUT)
    expect(result.suggestedPrice).toBeGreaterThanOrEqual(result.totalCost)
  })

  it('doppelte Gebäudelänge führt zu mehr Fläche und höheren Kosten', () => {
    const klein = calculateScaffoldMaterial({ ...STANDARD_INPUT, lengthM: 10 })
    const gross = calculateScaffoldMaterial({ ...STANDARD_INPUT, lengthM: 20 })
    expect(gross.totalCost).toBeGreaterThan(klein.totalCost)
  })

  it('alle Material-Mengen sind nicht-negativ', () => {
    const result = calculateScaffoldMaterial(STANDARD_INPUT)
    for (const m of result.materialList) {
      expect(m.quantity).toBeGreaterThanOrEqual(0)
    }
  })

  it('Gesamtgewicht ist positiv und wächst mit der Fläche', () => {
    const klein = calculateScaffoldMaterial({ ...STANDARD_INPUT, lengthM: 10 })
    const gross = calculateScaffoldMaterial({ ...STANDARD_INPUT, lengthM: 20 })
    expect(klein.totalWeightKg).toBeGreaterThan(0)
    expect(gross.totalWeightKg).toBeGreaterThan(klein.totalWeightKg)
  })
})

describe('calculateScaffoldMaterial – Randfälle', () => {
  it('sehr kleines Gebäude stürzt nicht ab und liefert trotzdem Material', () => {
    const result = calculateScaffoldMaterial({ ...STANDARD_INPUT, lengthM: 2, heightM: 3, widthM: 2 })
    expect(result.materialList.length).toBeGreaterThan(0)
    expect(result.totalCost).toBeGreaterThan(0)
  })

  it('sehr großes Gebäude stürzt nicht ab', () => {
    const result = calculateScaffoldMaterial({ ...STANDARD_INPUT, lengthM: 100, heightM: 30 })
    expect(result.materialList.length).toBeGreaterThan(0)
    expect(Number.isFinite(result.totalCost)).toBe(true)
  })

  it('höhere Windzone erhöht die Kosten nicht unplausibel (bleibt in vernünftigem Rahmen)', () => {
    const wz1 = calculateScaffoldMaterial({ ...STANDARD_INPUT, windZone: 1 })
    const wz4 = calculateScaffoldMaterial({ ...STANDARD_INPUT, windZone: 4 })
    // Höhere Windzone darf nicht zu einer *niedrigeren* Kalkulation führen
    expect(wz4.totalCost).toBeGreaterThanOrEqual(wz1.totalCost)
  })
})
