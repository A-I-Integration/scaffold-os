import { describe, it, expect } from 'vitest'
import { calculateScaffoldMaterial } from '@/lib/calculations/scaffold-engine'
import type { ScaffoldInput } from '@/types/scaffold'

function zufall(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 } }

const BASIS: ScaffoldInput = {
  customer: 'T', address: 'x', trade: 'fassade', projectDurationDays: 14, lengthM: 15, heightM: 10, widthM: 8, eavesHeightM: 10,
  roofForm: 'satteldach', roofOverhangM: 0.3, facadeType: 'mauerwerk', obstacles: [], scaffoldType: 'rahmen', deckingType: 'stahl',
  fieldLengthM: 2.57, groundType: 'beton', anchorType: 'fassadenanker', groundCondition: 'beton', hasSlope: false, hasLightShafts: false,
  hasBasement: false, needsLoadDistribution: false,
  environment: { hasPowerLines: false, hasVegetation: false, hasNeighborProperty: false, hasPublicTraffic: false, needsNoParkingZone: false, needsSpecialUse: false, hasStorageArea: false, hasTruckAccess: false, needsCrane: false, needsProtectionRoof: false, needsSafetyNet: false },
  windZone: 2, hazards: [], additionalNotes: '',
}
const TYPEN = ['rahmen', 'modul'] as const
const FELD = [2.07, 2.57, 3.07]

describe('Mengenermittlung (Kalkulationskern): Regeln für jede Eingabe', () => {
  it('Zufallstest (200 Fälle): endliche, ganze, nicht negative Mengen; Preise und Gewicht stimmen mit den Zeilen überein', () => {
    const z = zufall(2026)
    for (let i = 0; i < 200; i++) {
      const input: ScaffoldInput = {
        ...BASIS, scaffoldType: TYPEN[Math.floor(z() * 2)], fieldLengthM: FELD[Math.floor(z() * 3)],
        lengthM: 2 + z() * 60, heightM: 2 + z() * 30, windZone: (1 + Math.floor(z() * 4)) as 1 | 2 | 3 | 4,
        projectDurationDays: Math.floor(z() * 90),
      }
      const r = calculateScaffoldMaterial(input)
      const info = `Fall ${i}: ${input.lengthM.toFixed(1)}×${input.heightM.toFixed(1)} ${input.scaffoldType} Feld ${input.fieldLengthM}`
      for (const m of r.materialList) {
        expect(Number.isFinite(m.quantity), info + ' ' + m.name).toBe(true)
        expect(m.quantity, info + ' ' + m.name).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(m.quantity), `${info}: ${m.name} hat Menge ${m.quantity} (Bauteile gibt es nur ganz)`).toBe(true)
        expect(Math.abs(m.totalPrice - m.quantity * m.unitPrice), info + ' ' + m.name).toBeLessThanOrEqual(0.011)
      }
      // keine Artikelnummer doppelt in der Liste
      const nrn = r.materialList.map((m) => m.articleNumber)
      expect(new Set(nrn).size, info + ': doppelte Artikelnummer').toBe(nrn.length)
      const gewicht = r.materialList.reduce((s, m) => s + m.quantity * m.weightKg, 0)
      expect(Math.abs(r.totalWeightKg - gewicht), `${info}: Gewicht ${r.totalWeightKg} ≠ Zeilensumme ${gewicht}`).toBeLessThanOrEqual(1)
      expect(Number.isFinite(r.totalCost) && r.totalCost > 0, info).toBe(true)
      expect(r.suggestedPrice, info).toBeGreaterThanOrEqual(r.totalCost)
    }
  })

  it('mehr Gebäude (länger / höher) braucht nie weniger Material', () => {
    const z = zufall(7)
    for (let i = 0; i < 100; i++) {
      const a: ScaffoldInput = { ...BASIS, scaffoldType: TYPEN[Math.floor(z() * 2)], fieldLengthM: FELD[Math.floor(z() * 3)], lengthM: 5 + z() * 40, heightM: 4 + z() * 20 }
      const laenger = { ...a, lengthM: a.lengthM + 3 + z() * 10 }
      const hoeher = { ...a, heightM: a.heightM + 3 + z() * 10 }
      const k0 = calculateScaffoldMaterial(a), k1 = calculateScaffoldMaterial(laenger), k2 = calculateScaffoldMaterial(hoeher)
      const flaeche = (r: typeof k0) => (r.totalAreaM2 ?? 0)
      expect(flaeche(k1), `länger ${i}`).toBeGreaterThanOrEqual(flaeche(k0))
      expect(flaeche(k2), `höher ${i}`).toBeGreaterThanOrEqual(flaeche(k0))
      expect(k1.totalWeightKg, `Gewicht länger ${i}`).toBeGreaterThanOrEqual(k0.totalWeightKg)
      expect(k2.totalWeightKg, `Gewicht höher ${i}`).toBeGreaterThanOrEqual(k0.totalWeightKg)
    }
  })

  it('ein einzelner Abschnitt ergibt dieselbe Rechnung wie die Angabe ohne Abschnitte', () => {
    const ohne = calculateScaffoldMaterial({ ...BASIS, lengthM: 18, heightM: 9 })
    const mit = calculateScaffoldMaterial({ ...BASIS, lengthM: 18, heightM: 9, sections: [{ bezeichnung: 'Gerüst', lengthM: 18, heightM: 9, fieldLengthM: BASIS.fieldLengthM, roofOverhangM: BASIS.roofOverhangM }] })
    expect(mit.totalWeightKg).toBeCloseTo(ohne.totalWeightKg, 3)
    expect(mit.materialList.map((m) => [m.articleNumber, m.quantity])).toEqual(ohne.materialList.map((m) => [m.articleNumber, m.quantity]))
  })

  it('zwei Abschnitte = Summe der beiden einzelnen Abschnitte beim Rahmen-, Belag- und Diagonalenmaterial', () => {
    const a = { bezeichnung: 'A', lengthM: 12, heightM: 8, fieldLengthM: 2.57, roofOverhangM: 0.3 }
    const b = { bezeichnung: 'B', lengthM: 9, heightM: 8, fieldLengthM: 2.57, roofOverhangM: 0.3 }
    const nur = (s: typeof a) => calculateScaffoldMaterial({ ...BASIS, lengthM: s.lengthM, heightM: s.heightM, sections: [s] })
    const beide = calculateScaffoldMaterial({ ...BASIS, lengthM: 21, heightM: 8, sections: [a, b] })
    const menge = (r: ReturnType<typeof nur>, nr: string) => r.materialList.find((m) => m.articleNumber === nr)?.quantity ?? 0
    for (const nr of ['RA-002']) {
      expect(menge(beide, nr), nr).toBe(menge(nur(a), nr) + menge(nur(b), nr))
    }
  })
})
