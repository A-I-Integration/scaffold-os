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
  it('CAD-Projekt: gespeichertes Gebäude kommt unverändert zurück', () => {
    const b = { lengthM: 20, widthM: 10, heightM: 12, sides: ['front', 'left'] }
    const r = aufmassZuCad({ step2: s2, kiResult: { building: b, systemId: 'layher-allround' } })
    expect(r.building).toBe(b)
  })
  it('leseCadUebergabe prüft die Daten', () => {
    expect(leseCadUebergabe(null)).toBeNull()
    expect(leseCadUebergabe('kaputt')).toBeNull()
    expect(leseCadUebergabe(JSON.stringify({ building: { lengthM: 0 } }))).toBeNull()
    expect(leseCadUebergabe(JSON.stringify({ building: { lengthM: 1, widthM: 1, heightM: 1 }, systemId: 'a' }))?.systemId).toBe('a')
  })
})
