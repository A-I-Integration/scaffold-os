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
import { calculateScaffoldMaterial, artikelFuerFeldlaenge } from '../scaffold-engine'
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

describe('calculateScaffoldMaterial – unterschiedliche Gerüsttypen je Abschnitt (NEU)', () => {
  it('nutzt pro Abschnitt den eigenen Gerüsttyp für die Lagen-Berechnung', () => {
    // "rahmen" hat 2,0 m Rahmenhöhe, "modul" 1,5 m – bei 6 m Höhe muss
    // das genau 3 bzw. 4 Lagen ergeben.
    const result = calculateScaffoldMaterial({
      ...STANDARD_INPUT,
      sections: [
        { bezeichnung: 'Hauptfassade', lengthM: 10, heightM: 6, scaffoldType: 'rahmen' },
        { bezeichnung: 'Anbau', lengthM: 5, heightM: 6, scaffoldType: 'modul' },
      ],
    })
    const hauptfassade = result.sectionBreakdown?.find((s) => s.bezeichnung === 'Hauptfassade')
    const anbau = result.sectionBreakdown?.find((s) => s.bezeichnung === 'Anbau')
    expect(hauptfassade?.levels).toBe(3) // 6 / 2.0
    expect(anbau?.levels).toBe(4)        // 6 / 1.5
  })

  it('ohne eigenen Typ je Abschnitt gilt weiterhin der globale Gerüsttyp (rückwärtskompatibel)', () => {
    const result = calculateScaffoldMaterial({
      ...STANDARD_INPUT,
      scaffoldType: 'modul',
      // Zwei Abschnitte, damit sectionBreakdown überhaupt mitgeliefert wird
      // (bei nur einem Abschnitt bewusst weggelassen, siehe engine).
      sections: [
        { bezeichnung: 'Ohne eigenen Typ A', lengthM: 10, heightM: 6 },
        { bezeichnung: 'Ohne eigenen Typ B', lengthM: 8, heightM: 6 },
      ],
    })
    const a = result.sectionBreakdown?.find((s) => s.bezeichnung === 'Ohne eigenen Typ A')
    const b = result.sectionBreakdown?.find((s) => s.bezeichnung === 'Ohne eigenen Typ B')
    expect(a?.levels).toBe(4) // 6 / 1.5 (modul, vom globalen Typ übernommen)
    expect(b?.levels).toBe(4)
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

describe('calculateScaffoldMaterial – gemischte Feldlängen je Abschnitt', () => {
  const abschnitt = (lengthM: number, fieldLengthM: number) =>
    ({ lengthM, heightM: 10, fieldLengthM, roofOverhangM: 0.3, bezeichnung: 'Abschnitt' })
  const menge = (r: ReturnType<typeof calculateScaffoldMaterial>, nr: string) =>
    r.materialList.find(m => m.articleNumber === nr)?.quantity ?? 0

  it('artikelFuerFeldlaenge: Stufen bei 2,5 m und 3,0 m', () => {
    expect(artikelFuerFeldlaenge('RA', 2.07)).toBe('RA-001')
    expect(artikelFuerFeldlaenge('AB', 2.5)).toBe('AB-002')
    expect(artikelFuerFeldlaenge('DI', 2.57)).toBe('DI-002')
    expect(artikelFuerFeldlaenge('GE', 3.0)).toBe('GE-003')
  })

  it('einheitliche Feldlänge: wie bisher genau ein Artikel je Bauteil', () => {
    const r = calculateScaffoldMaterial({ ...STANDARD_INPUT, sections: [abschnitt(40, 2.07)] } as ScaffoldInput)
    expect(menge(r, 'RA-001')).toBe(200)
    expect(menge(r, 'RA-002') + menge(r, 'RA-003')).toBe(0)
  })

  it('3,07 m + 2,07 m: jeder Abschnitt mit seinem eigenen Artikel (Reihenfolge egal)', () => {
    for (const sections of [[abschnitt(20, 3.07), abschnitt(20, 2.07)], [abschnitt(20, 2.07), abschnitt(20, 3.07)]]) {
      const r = calculateScaffoldMaterial({ ...STANDARD_INPUT, sections } as ScaffoldInput)
      expect(menge(r, 'RA-003')).toBe(70)   // 7 Felder × 5 Lagen × 2
      expect(menge(r, 'RA-001')).toBe(100)  // 10 Felder × 5 Lagen × 2
      expect(menge(r, 'AB-003')).toBe(35)
      expect(menge(r, 'AB-001')).toBe(50)
      expect(menge(r, 'DI-003') + menge(r, 'DI-001')).toBe(170)
      expect(menge(r, 'GE-003')).toBe(70)
      expect(menge(r, 'GE-001')).toBe(100)
    }
  })

  it('Fußplatten bleiben so viele wie Rahmen insgesamt', () => {
    const r = calculateScaffoldMaterial({ ...STANDARD_INPUT, sections: [abschnitt(20, 3.07), abschnitt(20, 2.07)] } as ScaffoldInput)
    expect(menge(r, 'FP-001')).toBe(170)
  })

  it('gemischt ist günstiger als alles mit dem großen Artikel', () => {
    const gemischt = calculateScaffoldMaterial({ ...STANDARD_INPUT, sections: [abschnitt(20, 3.07), abschnitt(20, 2.07)] } as ScaffoldInput)
    const preis = (nr: string) => gemischt.materialList.find(m => m.articleNumber === nr)!.unitPrice
    const alleGross = 170 * preis('RA-003')
    const rahmenKosten = gemischt.materialList.filter(m => m.articleNumber.startsWith('RA-')).reduce((s, m) => s + m.totalPrice, 0)
    expect(rahmenKosten).toBeLessThan(alleGross)
  })
})
