import { describe, it, expect } from 'vitest'
import { berechneAngebot, baueRechnungsPositionen, summeNetto, eingabeAusProjektData, type RechnungsEingabe } from '@/lib/schlussrechnung'
import { angebotNettoAusProjekt } from '@/lib/auftragsstand'

// Angebotswert: Schritt 6 (berechneAngebot), Rechnung (Positionen) und Auftragsstand/Dashboard müssen dieselbe Zahl liefern – auch bei Komma-Eingaben.
const ki = { totalAreaM2: 1000, suggestedPrice: 12345.67 }
const faelle: [string, RechnungsEingabe][] = [
  ['KI ohne Anpassungen', { kiResult: ki, preisModus: 'ki', festpreisProM2: '', anpassungen: {}, kranAktiv: false, kranTage: 1, kranTagessatz: 850 }],
  ['Festpreis mit Komma', { kiResult: ki, preisModus: 'festpreis', festpreisProM2: '8,5', anpassungen: {}, kranAktiv: false, kranTage: 1, kranTagessatz: 850 }],
  ['Pauschale 12.500,50', { kiResult: ki, preisModus: 'pauschale', festpreisProM2: '', pauschale: '12.500,50', anpassungen: {}, kranAktiv: false, kranTage: 1, kranTagessatz: 850 }],
  ['Miete 1,5 Wochen × 99,90', { kiResult: ki, preisModus: 'festpreis', festpreisProM2: '8', anpassungen: { miete: { aktiv: true, wochen: '1,5', preisProWoche: '99,90' } }, kranAktiv: false, kranTage: 1, kranTagessatz: 850 }],
  ['Alles zusammen inkl. Kran, Fahrt, Rabatt', { kiResult: ki, preisModus: 'festpreis', festpreisProM2: '8,25', anpassungen: {
    miete: { aktiv: true, wochen: '2', preisProWoche: '1.234,50' }, nachtrag: { aktiv: true, betrag: '1.000,25' }, statik: { aktiv: true, betrag: '450' }, rabatt: { aktiv: true, betrag: '500,10' },
    fahrt: { aktiv: true, km: '84', satzProKm: '1,20' }, skonto: true }, kranAktiv: true, kranTage: 3, kranTagessatz: 850 }],
  ['Rabatt größer als Preis → nie negativ', { kiResult: ki, preisModus: 'pauschale', festpreisProM2: '', pauschale: '100', anpassungen: { rabatt: { aktiv: true, betrag: '5.000' } }, kranAktiv: false, kranTage: 1, kranTagessatz: 850 }],
]

describe('Angebotswert: eine Rechnung für Schritt 6, Rechnung und Dashboard', () => {
  for (const [name, e] of faelle) {
    it(name, () => {
      const a = berechneAngebot(e)
      const pos = summeNetto(baueRechnungsPositionen({ eingabe: e, basis: 'angebot' }))
      expect(a.endpreis).toBeCloseTo(pos, 2)
      const data = { kiResult: e.kiResult, preisModus: e.preisModus, festpreisProM2: e.festpreisProM2, pauschale: e.pauschale, angebotAnpassungen: e.anpassungen,
        step4: { kranErforderlich: e.kranAktiv }, step1: { dauer: String(e.kranTage) } }
      expect(angebotNettoAusProjekt(data, e.kranTagessatz)).toBeCloseTo(a.endpreis, 2)
      expect(eingabeAusProjektData(data, e.kranTagessatz).anpassungen).toEqual(e.anpassungen)
    })
  }
  it('Komma wird richtig gelesen: 1,5 Wochen × 100 = 150 (nicht 100)', () => {
    const e = faelle[3][1]
    expect(berechneAngebot(e).mieteBetrag).toBeCloseTo(1.5 * 99.9, 2)
  })
  it('Skonto wird nur ausgewiesen, mindert den Endpreis nicht', () => {
    const a = berechneAngebot(faelle[4][1])
    expect(a.skontoBetrag).toBeCloseTo(a.endpreis * 0.02, 5)
  })
})
