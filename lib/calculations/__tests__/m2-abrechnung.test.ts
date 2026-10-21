import { describe, it, expect } from 'vitest'
import { berechneM2Abrechnung, pruefeAbrechnungEintrag } from '../m2-abrechnung'

describe('Abrechnung nach m²', () => {
  it('Fläche × (Grundpreis + Aufpreise)', () => {
    const r = berechneM2Abrechnung({ flaecheM2: 1000, grundpreisM2: 12.5, aufpreiseM2: [2, 1.25] })
    expect(r.preisProM2).toBe(15.75)
    expect(r.summe).toBe(15750)
  })
  it('ohne Aufpreise gilt der Grundpreis', () => {
    expect(berechneM2Abrechnung({ flaecheM2: 606.3, grundpreisM2: 10, aufpreiseM2: [] })).toEqual({ preisProM2: 10, summe: 6063 })
  })
  it('rundet auf Cent', () => {
    expect(berechneM2Abrechnung({ flaecheM2: 333.33, grundpreisM2: 11.11, aufpreiseM2: [] }).summe).toBe(3703.3)
  })
  it('ungültige Werte zählen als 0', () => {
    expect(berechneM2Abrechnung({ flaecheM2: NaN, grundpreisM2: 10, aufpreiseM2: [] }).summe).toBe(0)
    expect(berechneM2Abrechnung({ flaecheM2: 100, grundpreisM2: -5, aufpreiseM2: [3, NaN] }).preisProM2).toBe(3)
  })
})

describe('Eintrag prüfen', () => {
  it('akzeptiert gültige Einträge, auch mit Komma', () => {
    expect(pruefeAbrechnungEintrag({ art: 'grundpreis', name: 'Fassadengerüst', preis_m2: '12,5' })).toBeNull()
    expect(pruefeAbrechnungEintrag({ art: 'aufpreis', name: 'Höhe über 20 m', preis_m2: 2 })).toBeNull()
  })
  it('lehnt Fehler ab', () => {
    expect(pruefeAbrechnungEintrag({ art: 'x', name: 'a', preis_m2: 1 })).toMatch(/Art/)
    expect(pruefeAbrechnungEintrag({ art: 'aufpreis', name: '  ', preis_m2: 1 })).toMatch(/Bezeichnung/)
    expect(pruefeAbrechnungEintrag({ art: 'aufpreis', name: 'a', preis_m2: 'abc' })).toMatch(/Preis/)
    expect(pruefeAbrechnungEintrag({ art: 'aufpreis', name: 'a', preis_m2: -1 })).toMatch(/zwischen/)
    expect(pruefeAbrechnungEintrag({ art: 'aufpreis', name: 'a', preis_m2: 20000 })).toMatch(/zwischen/)
  })
})
