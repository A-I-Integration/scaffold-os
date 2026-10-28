import { describe, it, expect } from 'vitest'
import { aufmassZuCad, leseCadUebergabe } from '../aufmass-zu-cad'

const s2 = { laenge: '12,5', breite: '9', hoehe: '10', traufhoehe: '7', dachform: 'Satteldach', dachueberstand: '0.5' }

describe('Aufmaß → CAD', () => {
  it('baut das Gebäude aus Schritt 2 (Länge × Höhe auf einer Seite wie im Aufmaß)', () => {
    const r = aufmassZuCad({ step2: s2, step3: { system: 'layher-allround' } })
    expect(r.ok).toBe(true)
    expect(r.building).toMatchObject({ lengthM: 12.5, widthM: 9, heightM: 10, eavesHeightM: 7, roofHeightM: 3, roofForm: 'satteldach', sides: ['front'] })
    expect(r.systemId).toBe('layher-allround')
  })
  it('meldet fehlende Pflichtmaße statt zu erfinden', () => {
    const r = aufmassZuCad({ step2: { laenge: '10', hoehe: '' } })
    expect(r.ok).toBe(false)
    expect(r.fehlend).toEqual(['Breite/Tiefe des Gebäudes', 'Höhe'])
  })
  it('weitere Abschnitte werden übernommen', () => {
    const r = aufmassZuCad({ step2: { ...s2, abschnitte: [{ bezeichnung: 'Anbau', laenge: '5', hoehe: '4' }, { laenge: '', hoehe: '3' }] } })
    expect(r.building?.sections).toHaveLength(2)
    expect(r.building?.sections?.[1]).toMatchObject({ bezeichnung: 'Anbau', laengeM: 5, hoeheM: 4 })
  })
  it('unbekanntes System und Dachform → Hinweis, kein Absturz', () => {
    const r = aufmassZuCad({ step2: { ...s2, dachform: 'Tonnendach' }, step3: { system: 'xyz' } })
    expect(r.ok).toBe(true)
    expect(r.hinweise.join(' ')).toMatch(/Layher Allround/)
    expect(r.hinweise.join(' ')).toMatch(/Tonnendach/)
  })
  it('CAD-Projekt: stimmt das Aufmaß überein, bleibt das gespeicherte Gebäude erhalten', () => {
    const b = { lengthM: 12.5, widthM: 9, heightM: 10, eavesHeightM: 7, overhangM: 0.5, roofForm: 'satteldach', sides: ['front', 'left'], tueren: [1] }
    const r = aufmassZuCad({ step2: s2, kiResult: { building: b, systemId: 'layher-allround' } })
    expect(r.building).toMatchObject(b)
    expect(r.hinweise[0]).toMatch(/stimmen überein/)
  })
  it('CAD-Projekt: später geändertes Aufmaß hat Vorrang, Rest bleibt', () => {
    const b = { lengthM: 20, widthM: 10, heightM: 12, eavesHeightM: 9, roofForm: 'flachdach', sides: ['front', 'left'], geruestOptionen: { x: 1 } }
    const r = aufmassZuCad({ step2: { laenge: '22', breite: '10', hoehe: '15', traufhoehe: '9', dachform: 'Flachdach' }, kiResult: { building: b } })
    expect(r.building).toMatchObject({ lengthM: 22, heightM: 15, widthM: 10, sides: ['front', 'left'], geruestOptionen: { x: 1 } })
    expect(r.hinweise.join(' ')).toMatch(/Länge: CAD 20 m → Aufmaß 22 m/)
  })
  it('CAD-Projekt mit Umriss: Maße des Umrisses bleiben', () => {
    const b = { lengthM: 20, widthM: 10, heightM: 12, umriss: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] }
    const r = aufmassZuCad({ step2: { laenge: '99', breite: '99', hoehe: '12' }, kiResult: { building: b } })
    expect(r.building?.lengthM).toBe(20)
  })
  it('leseCadUebergabe prüft die Daten', () => {
    expect(leseCadUebergabe(null)).toBeNull()
    expect(leseCadUebergabe('kaputt')).toBeNull()
    expect(leseCadUebergabe(JSON.stringify({ building: { lengthM: 0 } }))).toBeNull()
    expect(leseCadUebergabe(JSON.stringify({ building: { lengthM: 1, widthM: 1, heightM: 1 }, systemId: 'a' }))?.systemId).toBe('a')
  })
})
