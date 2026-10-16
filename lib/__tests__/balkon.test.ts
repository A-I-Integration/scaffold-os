import { describe, it, expect } from 'vitest'
import { balkonAbzug, balkonWirkung, balkoneFuerAbschnitt, KONSOLE_BREITE_M } from '../balkon'
import { abschnitteAusSchritt2, berechneAufmass, erzeugeAufmassblattPdf } from '../aufmassblatt-pdf'
import { calculateScaffoldMaterial } from '../calculations/scaffold-engine'
import type { ScaffoldBalkon, ScaffoldInput } from '../../types/scaffold'

const bal = (p: Partial<ScaffoldBalkon>): ScaffoldBalkon => ({ breiteM: 3, anzahl: 1, auskragungM: 1, modus: 'durchlaufend', abzug: false, ...p })

describe('balkoneFuerAbschnitt', () => {
  const roh = [
    { abschnitt: '0', breite: '3,5', anzahl: '2', auskragung: '1,2', modus: 'ausgespart', abzug: true },
    { abschnitt: '1', breite: '2' },
    { abschnitt: '0', breite: '' },
    { abschnitt: '0', breite: '-1' },
  ]
  it('liest Komma-Zahlen, Anzahl und Modus für den gewählten Abschnitt; ungültige werden ignoriert', () => {
    const a = balkoneFuerAbschnitt(roh, 0)
    expect(a).toEqual([{ bezeichnung: undefined, breiteM: 3.5, anzahl: 2, auskragungM: 1.2, modus: 'ausgespart', abzug: true }])
  })
  it('Standardwerte: Anzahl 1, durchlaufend, kein Abzug', () => {
    expect(balkoneFuerAbschnitt(roh, 1)).toEqual([{ bezeichnung: undefined, breiteM: 2, anzahl: 1, auskragungM: 0, modus: 'durchlaufend', abzug: false }])
  })
  it('kein Array / anderer Abschnitt → leer', () => {
    expect(balkoneFuerAbschnitt(undefined, 0)).toEqual([])
    expect(balkoneFuerAbschnitt(roh, 5)).toEqual([])
  })
})

describe('balkonWirkung', () => {
  it('ausgespart: Breite × Anzahl wird von der Gerüstlänge abgezogen', () => {
    const w = balkonWirkung(20, 2.07, [bal({ modus: 'ausgespart', anzahl: 2, breiteM: 3 })])
    expect(w).toMatchObject({ ausgespartM: 6, laengeGeruestM: 14, konsolenProLage: 0, anzahlAusgespart: 2 })
  })
  it('ausgespart ist auf die Abschnittslänge begrenzt', () => {
    const w = balkonWirkung(20, 2.07, [bal({ modus: 'ausgespart', anzahl: 10, breiteM: 5 })])
    expect(w.ausgespartM).toBe(20)
    expect(w.laengeGeruestM).toBe(0)
  })
  it('durchlaufend: (Felder + 1) × ceil(Auskragung / 0,73) Konsolen je Lage', () => {
    // 3 m / 2,07 → 2 Felder → 3 Stellen; 1,0 m / 0,73 → 2 Konsolen je Stelle
    expect(balkonWirkung(20, 2.07, [bal({})]).konsolenProLage).toBe(6)
    expect(balkonWirkung(20, 2.07, [bal({ anzahl: 2 })]).konsolenProLage).toBe(12)
  })
  it('Auskragung genau eine Konsolenbreite → 1 Konsole je Stelle; ohne Auskragung keine', () => {
    expect(balkonWirkung(20, 2.07, [bal({ auskragungM: KONSOLE_BREITE_M })]).konsolenProLage).toBe(3)
    expect(balkonWirkung(20, 2.07, [bal({ auskragungM: 0 })]).konsolenProLage).toBe(0)
  })
  it('durchlaufend ändert die Gerüstlänge nicht', () => {
    expect(balkonWirkung(20, 2.07, [bal({})]).laengeGeruestM).toBe(20)
  })
})

describe('balkonAbzug', () => {
  it('ausgespart wird immer abgezogen (Breite × Höhe)', () => {
    const a = balkonAbzug([bal({ modus: 'ausgespart', anzahl: 2, breiteM: 3 })], 20, 8)
    expect(a?.flaecheM2).toBe(48)
    expect(a?.text).toContain('2 Stk.')
  })
  it('durchlaufend nur mit abzug = true', () => {
    expect(balkonAbzug([bal({})], 20, 8)).toBeNull()
    expect(balkonAbzug([bal({ abzug: true })], 20, 8)?.flaecheM2).toBe(24)
  })
  it('Abzug nie größer als die Abschnittsfläche', () => {
    expect(balkonAbzug([bal({ modus: 'ausgespart', anzahl: 10, breiteM: 5 })], 20, 8)?.flaecheM2).toBe(160)
  })
})

describe('Aufmaß mit Balkonen', () => {
  it('berechneAufmass zieht ausgesparte Balkone ab und weist Brutto/Abzug aus', () => {
    const r = berechneAufmass([{ bezeichnung: 'F', laengeM: 10, hoeheM: 6, balkone: [bal({ modus: 'ausgespart', breiteM: 2 })] }])
    expect(r.zeilen[0]).toMatchObject({ flaecheBruttoM2: 60, abzugM2: 12, flaecheM2: 48 })
    expect(r.gesamtM2).toBe(48)
  })
  it('durchlaufender Balkon ohne Abzug ändert die Fläche nicht', () => {
    const r = berechneAufmass([{ bezeichnung: 'F', laengeM: 10, hoeheM: 6, balkone: [bal({})] }])
    expect(r.gesamtM2).toBe(60)
    expect(r.zeilen[0].abzugM2).toBe(0)
  })
  it('abschnitteAusSchritt2 ordnet Balkone dem richtigen Abschnitt zu (auch wenn ein Zwischen-Abschnitt ungültig ist)', () => {
    const a = abschnitteAusSchritt2({
      laenge: '10', hoehe: '6',
      abschnitte: [{ bezeichnung: 'leer', laenge: '', hoehe: '3' }, { bezeichnung: 'Anbau', laenge: '4', hoehe: '3' }],
      balkone: [{ abschnitt: '0', breite: '2', modus: 'ausgespart' }, { abschnitt: '2', breite: '1', modus: 'ausgespart' }],
    })
    expect(a.map((x) => x.bezeichnung)).toEqual(['Abschnitt 1', 'Anbau'])
    expect(a[0].balkone?.[0].breiteM).toBe(2)
    expect(a[1].balkone?.[0].breiteM).toBe(1)
  })
  it('das Aufmaßblatt-PDF mit Balkon-Abzug lässt sich erzeugen', () => {
    const doc = erzeugeAufmassblattPdf({ kunde: 'K', adresse: 'A', abschnitte: [{ bezeichnung: 'F', laengeM: 10, hoeheM: 6, balkone: [bal({ modus: 'ausgespart', breiteM: 2 })] }] })
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })
  it('ohne Balkone bleibt alles wie bisher', () => {
    const a = abschnitteAusSchritt2({ laenge: '10', hoehe: '6' })
    expect(a).toEqual([{ bezeichnung: 'Fassade', laengeM: 10, hoeheM: 6 }])
  })
})

describe('Material mit Balkonen (scaffold-engine)', () => {
  const basis = {
    customer: 'K', address: 'A', trade: 'allgemein', projectDurationDays: 30, lengthM: 20, heightM: 10, widthM: 10, eavesHeightM: 8,
    roofForm: 'satteldach', roofOverhangM: 0.3, facadeType: 'mauerwerk', obstacles: [], scaffoldType: 'fassadengeruest',
    deckingType: 'stahl', fieldLengthM: 2.07, groundType: 'beton', anchorType: 'fassadenanker', groundCondition: 'beton',
    hasSlope: false, hasLightShafts: false, hasBasement: false, needsLoadDistribution: false,
    environment: { hasPowerLines: false, hasVegetation: false, hasNeighborProperty: false, hasPublicTraffic: false, needsNoParkingZone: false, needsSpecialUse: false, hasStorageArea: false, hasTruckAccess: false, needsCrane: false, needsProtectionRoof: false, needsSafetyNet: false },
    windZone: 1, hazards: [], additionalNotes: '',
  } as unknown as ScaffoldInput
  const mit = (balkone?: ScaffoldBalkon[]) =>
    calculateScaffoldMaterial({ ...basis, sections: [{ bezeichnung: 'Fassade', lengthM: 20, heightM: 10, fieldLengthM: 2.07, roofOverhangM: 0.3, balkone }] })
  const menge = (r: ReturnType<typeof calculateScaffoldMaterial>, nr: string) => r.materialList.find((m) => m.articleNumber === nr)?.quantity ?? 0

  it('ohne Balkone: 10 Felder × 5 Lagen × 2 Rahmen = 100', () => {
    expect(menge(mit(undefined), 'RA-001')).toBe(100)
  })
  it('ausgesparte Balkone (2 × 3 m) → 14 m Gerüst → 7 Felder → 70 Rahmen, weniger Fläche', () => {
    const r = mit([bal({ modus: 'ausgespart', anzahl: 2, breiteM: 3 })])
    expect(menge(r, 'RA-001')).toBe(70)
    expect(r.totalAreaM2).toBe(140)
    expect(r.warnings.some((w) => w.includes('Balkone berücksichtigt'))).toBe(true)
  })
  it('durchlaufender Balkon: gleiche Rahmen, zusätzlich 6 Konsolen × 5 Lagen = 30 KO-001', () => {
    const r = mit([bal({})])
    expect(menge(r, 'RA-001')).toBe(100)
    expect(menge(r, 'KO-001')).toBe(30)
    expect(r.warnings.some((w) => w.includes('Dachüberstand'))).toBe(false)
  })
})
