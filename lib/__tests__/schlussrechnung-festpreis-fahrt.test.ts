import { describe, it, expect } from 'vitest'
import { baueRechnungsPositionen, berechneAngebotBetraege, summeNetto, eingabeAusProjektData, type RechnungsEingabe } from '../schlussrechnung'
import { angebotNettoAusProjekt } from '../auftragsstand'

const basis = (o: Partial<RechnungsEingabe>): RechnungsEingabe => ({ kiResult: { totalAreaM2: 200, suggestedPrice: 9000 }, preisModus: 'ki', festpreisProM2: '', anpassungen: {}, kranAktiv: false, kranTage: 1, kranTagessatz: 850, ...o })
const fahrt = { aktiv: true, km: 84, satzProKm: 1.2 }

describe('Fester Preis und Fahrt nach km in der Rechnungslogik', () => {
  it('Festpreis je m² + Fahrt: Gerüst 200 m² × 15 = 3000 €, Fahrt 84 km × 1,20 = 100,80 € als eigene Position', () => {
    const pos = baueRechnungsPositionen({ eingabe: basis({ preisModus: 'festpreis', festpreisProM2: '15', anpassungen: { fahrt } }), basis: 'angebot' })
    expect(pos.map((p) => [p.bezeichnung, p.einzelpreis])).toEqual([
      ['Gerüstbau gemäß Angebot (200 m² × 15 €/m²)', 3000],
      ['Fahrt (84 km à 1,2 €/km)', 100.8],
    ])
    expect(summeNetto(pos)).toBe(3100.8)
  })
  it('Pauschale je Auftrag + Fahrt', () => {
    const pos = baueRechnungsPositionen({ eingabe: basis({ preisModus: 'pauschale', pauschale: '2.500,00', anpassungen: { fahrt } }), basis: 'angebot' })
    expect(pos[0]).toMatchObject({ bezeichnung: 'Gerüstbau gemäß Angebot (Pauschale)', einzelpreis: 2500 })
    expect(summeNetto(pos)).toBe(2600.8)
  })
  it('Preis ist unabhängig von der Fläche (Pauschale)', () => {
    const a = summeNetto(baueRechnungsPositionen({ eingabe: basis({ preisModus: 'pauschale', pauschale: '2500', kiResult: { totalAreaM2: 50, suggestedPrice: 1 } }), basis: 'angebot' }))
    const b = summeNetto(baueRechnungsPositionen({ eingabe: basis({ preisModus: 'pauschale', pauschale: '2500', kiResult: { totalAreaM2: 900, suggestedPrice: 1 } }), basis: 'angebot' }))
    expect(a).toBe(2500); expect(b).toBe(2500)
  })
  it('Kalkulation nach Material (ki): Fahrt nach km wird nicht zusätzlich berechnet (Transport steckt im Preis)', () => {
    const e = basis({ preisModus: 'ki', anpassungen: { fahrt } })
    expect(berechneAngebotBetraege(e).fahrtBetrag).toBe(0)
    expect(baueRechnungsPositionen({ eingabe: e, basis: 'angebot' }).some((p) => p.bezeichnung.startsWith('Fahrt'))).toBe(false)
  })
  it('Fahrt inaktiv oder ohne km/Satz → keine Position', () => {
    for (const f of [{ aktiv: false, km: 84, satzProKm: 1.2 }, { aktiv: true, km: 0, satzProKm: 1.2 }, { aktiv: true, km: 84, satzProKm: null }]) {
      expect(baueRechnungsPositionen({ eingabe: basis({ preisModus: 'festpreis', festpreisProM2: '15', anpassungen: { fahrt: f } }), basis: 'angebot' })).toHaveLength(1)
    }
  })
  it('Fahrt steht auch bei Abrechnung nach Aufmaß; Kran, Rabatt bleiben wie bisher', () => {
    const e = basis({ preisModus: 'festpreis', festpreisProM2: '15', kranAktiv: true, anpassungen: { fahrt, rabatt: { aktiv: true, betrag: '100' } } })
    const pos = baueRechnungsPositionen({ eingabe: e, basis: 'aufmass', aufmassM2: 180, aufmassPreisProM2: 15 })
    expect(pos.map((p) => p.bezeichnung.split(' (')[0])).toEqual(['Gerüstbau nach Aufmaß', 'Kran', 'Fahrt', 'Sonderrabatt'])
    expect(summeNetto(pos)).toBe(2700 + 850 + 100.8 - 100)
  })
  it('Projektdaten: Pauschale und Fahrt werden gelesen; Angebotswert netto stimmt; ältere Projekte unverändert', () => {
    const d = { preisModus: 'pauschale', pauschale: '2500', kiResult: { totalAreaM2: 100, suggestedPrice: 1 }, angebotAnpassungen: { fahrt } }
    expect(eingabeAusProjektData(d, 850).preisModus).toBe('pauschale')
    expect(angebotNettoAusProjekt(d, 850)).toBe(2600.8)
    expect(angebotNettoAusProjekt({ preisModus: 'pauschale', pauschale: '2500', angebotAnpassungen: {} }, 850)).toBe(2500)
    const alt = { kiResult: { totalAreaM2: 100, suggestedPrice: 5000 } }
    expect(eingabeAusProjektData(alt, 850).preisModus).toBe('ki'); expect(angebotNettoAusProjekt(alt, 850)).toBe(5000)
  })
})
