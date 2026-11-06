// ============================================================
// SCAFFOLD OS – Abgleich der beiden Material-Wege
//
// Dasselbe Gebäude wird auf zwei Wegen gerechnet:
//   • Aufmaß-Weg: scaffold-engine.ts (calculateScaffoldMaterial, "KI-Material")
//   • CAD-Weg:    Aufmaß → CAD (aufmassZuCad) → generateCADModel → generateBillOfMaterials
//
// Fest zugesichert ist (und hier geprüft wird):
//   1. Die Gerüstfläche ist in beiden Wegen gleich (so steht es im Kopf von aufmass-zu-cad.ts).
//   2. Dieselbe Artikelnummer hat in beiden Wegen denselben Stückpreis. Die Preise stehen an
//      mehreren Stellen im Code (scaffold-engine.ts, cad-engine.ts, article-prices.ts); weichen
//      sie auseinander, bekäme derselbe Artikel je nach Weg einen anderen Preis.
//
// NICHT zugesichert: dass beide Stücklisten übereinstimmen. Die Regeln für Diagonalen,
// Kupplungen, Anker, Treppen u. a. sind in beiden Engines verschieden (siehe it.todo unten).
// ============================================================

import { describe, it, expect } from 'vitest'
import { calculateScaffoldMaterial } from '../scaffold-engine'
import { generateCADModel, generateBillOfMaterials } from '../cad-engine'
import { aufmassZuCad } from '@/lib/cad/aufmass-zu-cad'
import type { ScaffoldInput } from '@/types/scaffold'

/** Länge, Breite/Tiefe, Höhe in m – vom kleinen Haus bis zum hohen Gebäude. */
const GROESSEN: [number, number, number][] = [[8, 6, 4.5], [12, 8, 7.5], [20, 10, 10.5], [30, 12, 15], [40, 15, 19.5]]

function aufmassEingabe(laenge: number, breite: number, hoehe: number): ScaffoldInput {
  return {
    customer: 'Abgleich', address: 'Teststraße 1', trade: 'fassade', projectDurationDays: 14,
    lengthM: laenge, heightM: hoehe, widthM: breite, eavesHeightM: hoehe, roofForm: 'flachdach', roofOverhangM: 0,
    facadeType: 'mauerwerk', obstacles: [],
    scaffoldType: 'rahmen', deckingType: 'stahl', fieldLengthM: 2.57, groundType: 'beton',
    anchorType: 'fassadenanker', groundCondition: 'beton', hasSlope: false, hasLightShafts: false,
    hasBasement: false, needsLoadDistribution: false,
    environment: {
      hasPowerLines: false, hasVegetation: false, hasNeighborProperty: false, hasPublicTraffic: false, needsNoParkingZone: false,
      needsSpecialUse: false, hasStorageArea: false, hasTruckAccess: false, needsCrane: false, needsProtectionRoof: false, needsSafetyNet: false,
    },
    windZone: 2, hazards: [], additionalNotes: '',
  }
}

function beideWege(laenge: number, breite: number, hoehe: number) {
  const ki = calculateScaffoldMaterial(aufmassEingabe(laenge, breite, hoehe))
  const uebernahme = aufmassZuCad({
    step2: { laenge: String(laenge), breite: String(breite), hoehe: String(hoehe), dachform: 'flachdach' },
    step3: { system: 'layher-allround' },
  })
  if (!uebernahme.ok || !uebernahme.building) throw new Error('Übernahme ins CAD nicht möglich')
  const modell = generateCADModel(uebernahme.building, uebernahme.systemId)
  return { ki, modell, cadMaterial: generateBillOfMaterials(modell) }
}

describe('Abgleich Aufmaß-Weg und CAD-Weg', () => {
  for (const [l, b, h] of GROESSEN) {
    it(`Gerüstfläche ist gleich (${l} × ${h} m)`, () => {
      const { ki, modell } = beideWege(l, b, h)
      expect(modell.totalAreaM2).toBeCloseTo(ki.totalAreaM2 as number, 2)
    })

    it(`gleiche Artikelnummer = gleicher Stückpreis (${l} × ${h} m)`, () => {
      const { ki, cadMaterial } = beideWege(l, b, h)
      const kiPreis = new Map(ki.materialList.map((m) => [m.articleNumber, m.unitPrice]))
      const abweichungen = cadMaterial
        .filter((m) => kiPreis.has(m.articleNumber) && kiPreis.get(m.articleNumber) !== m.unitPrice)
        .map((m) => `${m.articleNumber}: Aufmaß ${kiPreis.get(m.articleNumber)} € / CAD ${m.unitPrice} €`)
      expect(abweichungen).toEqual([])
    })
  }

  it.todo('Stücklisten beider Wege stimmen überein – Diagonalen, Kupplungen, Anker und Treppen werden nach unterschiedlichen Regeln gerechnet; fachliche Entscheidung offen (docs/wissensbasis/DATA_FLOWS.md, F1)')
})
