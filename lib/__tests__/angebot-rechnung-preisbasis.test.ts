import { describe, it, expect } from 'vitest'
import { angebotsRechnungPositionen } from '../aufmass-rechnung'
import { angebotNettoAusProjekt } from '../auftragsstand'

// Fall aus der Praxis: KI-Kalkulation sagt 152.447 €, im Angebot ist aber Festpreis 10 €/m² × 1000 m² gewählt (= 10.000 €).
const summe = (p: { menge: number; einzelpreis: number }[]) => Math.round(p.reduce((s, x) => s + x.menge * x.einzelpreis, 0) * 100) / 100
const ki = { suggestedPrice: 152447, totalCost: 114335, totalAreaM2: 1000 }

describe('Rechnung aus Angebot: gewählte Preisbasis gilt, nicht der KI-Preis', () => {
  it('Festpreis je m²: 10.000 €, eine m²-Position, nicht 152.447 €', () => {
    const d = { kiResult: ki, preisModus: 'festpreis', festpreisProM2: '10' }
    const pos = angebotsRechnungPositionen(d, 850)
    expect(summe(pos)).toBe(10000)
    expect(pos).toHaveLength(1)
    expect(pos[0]).toMatchObject({ menge: 1000, einheit: 'm²', einzelpreis: 10 })
    expect(summe(pos)).toBe(angebotNettoAusProjekt(d, 850))
  })

  it('Pauschale: Pauschalbetrag, nicht der KI-Preis', () => {
    const d = { kiResult: ki, preisModus: 'pauschale', pauschale: '2.500' }
    expect(summe(angebotsRechnungPositionen(d, 850))).toBe(angebotNettoAusProjekt(d, 850))
  })

  it('KI-Kalkulation (Standard): KI-Preis gilt weiter', () => {
    const d = { kiResult: ki, preisModus: 'ki' }
    expect(summe(angebotsRechnungPositionen(d, 850))).toBe(152447)
  })

  it('ältere Projekte ohne Preisbasis: wie KI-Kalkulation', () => {
    expect(summe(angebotsRechnungPositionen({ kiResult: ki }, 850))).toBe(152447)
  })

  it('Festpreis mit Kran, Fahrt, Miete, Statik und Rabatt: Summe = Auftragswert-Berechnung', () => {
    const d = {
      kiResult: ki, preisModus: 'festpreis', festpreisProM2: '10',
      step4: { kranErforderlich: true }, step1: { dauer: '2' },
      angebotAnpassungen: {
        fahrt: { aktiv: true, km: '100', satzProKm: '1,2' },
        miete: { aktiv: true, wochen: '2', preisProWoche: '100' },
        statik: { aktiv: true, betrag: '300' },
        rabatt: { aktiv: true, betrag: '500' },
      },
    }
    const pos = angebotsRechnungPositionen(d, 850)
    expect(summe(pos)).toBe(10000 + 1700 + 120 + 200 + 300 - 500)
    expect(summe(pos)).toBe(angebotNettoAusProjekt(d, 850))
  })

  it('Festpreis mit mehreren Abschnitten: Summe bleibt der Festpreis, nicht der KI-Preis', () => {
    const d = { kiResult: { ...ki, sectionBreakdown: [{ bezeichnung: 'Nord', areaM2: 600 }, { bezeichnung: 'Süd', areaM2: 400 }] }, preisModus: 'festpreis', festpreisProM2: '10' }
    const pos = angebotsRechnungPositionen(d, 850)
    expect(pos).toHaveLength(2)
    expect(summe(pos)).toBe(10000)
  })
})
