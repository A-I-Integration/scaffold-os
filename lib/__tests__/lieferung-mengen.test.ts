import { describe, it, expect } from 'vitest'
import { lieferMengenAusMaterialliste } from '../lieferung-mengen'
import { calculateScaffoldMaterial } from '../calculations/scaffold-engine'
import type { ScaffoldInput } from '@/types/scaffold'

const z = (name: string, category: string, quantity: number) => ({ name, category, quantity })

describe('lieferMengenAusMaterialliste', () => {
  it('einzelne Zeilen: Menge wie in der Liste', () => {
    const m = lieferMengenAusMaterialliste([
      z('Rahmen 0,73 m', 'Rahmen', 200), z('Arbeitsbühne Stahl 2,07 m', 'Belag', 100),
      z('Diagonale 2,07 m', 'Diagonalen', 200), z('Geländer 2,07 m', 'Geländer', 200),
      z('Spindeltreppe', 'Treppen', 2), z('Fassadenanker Standard', 'Anker', 34),
    ])
    expect(m).toEqual({ arbeitsbuehnen: '100', rahmen: '200', diagonale: '200', gelander: '200', spindeltreppe: '2', anker: '34' })
  })

  it('mehrere Zeilen desselben Bauteils (gemischte Feldlängen) werden addiert', () => {
    const m = lieferMengenAusMaterialliste([
      z('Rahmen 0,73 m', 'Rahmen', 100), z('Rahmen 1,40 m', 'Rahmen', 70),
      z('Arbeitsbühne Stahl 2,07 m', 'Belag', 50), z('Arbeitsbühne Stahl 3,00 m', 'Belag', 35),
      z('Diagonale 2,07 m', 'Diagonalen', 100), z('Diagonale 3,00 m', 'Diagonalen', 70),
      z('Geländer 2,07 m', 'Geländer', 100), z('Geländer 3,00 m', 'Geländer', 70),
    ])
    expect(m.rahmen).toBe('170')
    expect(m.arbeitsbuehnen).toBe('85')
    expect(m.diagonale).toBe('170')
    expect(m.gelander).toBe('170')
  })

  it('Anker: Kupplungen stehen davor, zählen aber nicht', () => {
    const m = lieferMengenAusMaterialliste([z('Kupplung Dreh', 'Kupplungen', 400), z('Fassadenanker Standard', 'Anker', 34)])
    expect(m.anker).toBe('34')
  })

  it('kein Anker in der Liste: leer (dann greift die Schätzung aus Schritt 2)', () => {
    expect(lieferMengenAusMaterialliste([z('Kupplung Dreh', 'Kupplungen', 400)]).anker).toBe('')
  })

  it('leere oder fehlende Liste: alle Felder leer', () => {
    for (const l of [[], null, undefined]) {
      expect(Object.values(lieferMengenAusMaterialliste(l as any)).every(v => v === '')).toBe(true)
    }
  })

  it('Zeilen ohne Zahl als Menge werden ignoriert', () => {
    expect(lieferMengenAusMaterialliste([{ name: 'Rahmen', category: 'Rahmen', quantity: '5' }, z('Rahmen 2', 'Rahmen', 3)]).rahmen).toBe('3')
  })
})

describe('mit echter Kalkulation', () => {
  const B = {
    customer: 'T', address: 'x', trade: 'fassade', projectDurationDays: 14, lengthM: 15, heightM: 10, widthM: 8, eavesHeightM: 10,
    roofForm: 'satteldach', roofOverhangM: 0.3, facadeType: 'mauerwerk', obstacles: [], scaffoldType: 'rahmen', deckingType: 'stahl',
    fieldLengthM: 2.07, groundType: 'beton', anchorType: 'fassadenanker', groundCondition: 'beton', hasSlope: false, hasLightShafts: false,
    hasBasement: false, needsLoadDistribution: false,
    environment: { hasPowerLines: false, hasVegetation: false, hasNeighborProperty: false, hasPublicTraffic: false, needsNoParkingZone: false },
    windZone: 2, hazards: [], additionalNotes: '',
  } as unknown as ScaffoldInput
  const sec = (lengthM: number, fieldLengthM: number) => ({ lengthM, heightM: 10, fieldLengthM, roofOverhangM: 0.3, bezeichnung: 'A' })

  it('Anker-Feld bekommt die Anker-Menge, nicht die Kupplungen', () => {
    const liste = calculateScaffoldMaterial({ ...B, sections: [sec(40, 2.07)] }).materialList
    const anker = liste.find(m => m.articleNumber === 'AN-001')!.quantity
    const kupplungen = liste.find(m => m.articleNumber === 'KU-001')!.quantity
    expect(anker).not.toBe(kupplungen)
    expect(lieferMengenAusMaterialliste(liste).anker).toBe(String(anker))
  })

  it('gemischte Feldlängen: Rahmen-Feld = Summe beider Zeilen (170)', () => {
    const liste = calculateScaffoldMaterial({ ...B, sections: [sec(20, 3.07), sec(20, 2.07)] }).materialList
    expect(lieferMengenAusMaterialliste(liste).rahmen).toBe('170')
  })
})
