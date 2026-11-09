import { describe, it, expect } from 'vitest'
import { abschlagAbzug, baueAbzugsPositionen, baueRechnungsPositionen, berechneAngebotBetraege, istAbzugZuHoch, summeNetto, zahlAusEingabe, type RechnungsEingabe } from '@/lib/schlussrechnung'

// ============================================================
// Tiefenprüfung Rechenregeln der Schlussrechnung: Zahleneingaben, Abschläge (§ 14 Abs. 5 UStG), Rabatt, Summen.
// ============================================================

const eingabe = (extra: Partial<RechnungsEingabe> = {}): RechnungsEingabe => ({
  kiResult: { totalAreaM2: 100, suggestedPrice: 5000 }, preisModus: 'ki', festpreisProM2: '', anpassungen: {},
  kranAktiv: false, kranTage: 1, kranTagessatz: 850, ...extra,
})

describe('Zahleneingaben', () => {
  it.each([
    ['1500.5', 1500.5], ['1500,5', 1500.5], ['1.500,50', 1500.5], ['  12 ', 12], ['', 0], ['abc', 0], [undefined, 0], [null, 0], ['0,99', 0.99],
  ])('%s → %s', (eingabeWert, erwartet) => {
    expect(zahlAusEingabe(eingabeWert)).toBe(erwartet)
  })
  it('Beträge mit Komma werden in allen Anpassungen richtig gelesen (früher: "1500,50" ergab 1500)', () => {
    const b = berechneAngebotBetraege(eingabe({ anpassungen: {
      nachtrag: { aktiv: true, betrag: '1500,50' }, rabatt: { aktiv: true, betrag: '250,25' },
      miete: { aktiv: true, wochen: '3', preisProWoche: '99,90' }, statik: { aktiv: true, betrag: '1.200,00' },
    } }))
    expect(b.nachtragBetrag).toBe(1500.5)
    expect(b.rabattBetrag).toBe(250.25)
    expect(b.mieteBetrag).toBeCloseTo(299.7, 2)
    expect(b.statikBetrag).toBe(1200)
  })
  it('Festpreis je m² mit Komma', () => {
    expect(berechneAngebotBetraege(eingabe({ preisModus: 'festpreis', festpreisProM2: '12,50' })).basis).toBe(1250)
  })
})

describe('Positionen und Summen', () => {
  it('inaktive Anpassungen erzeugen keine Positionen', () => {
    const p = baueRechnungsPositionen({ eingabe: eingabe({ anpassungen: { rabatt: { aktiv: false, betrag: '100' }, nachtrag: { aktiv: false, betrag: '50' } } }), basis: 'angebot' })
    expect(p).toHaveLength(1)
    expect(summeNetto(p)).toBe(5000)
  })
  it('Rabatt wird als negative Position abgezogen', () => {
    const p = baueRechnungsPositionen({ eingabe: eingabe({ anpassungen: { rabatt: { aktiv: true, betrag: '500' } } }), basis: 'angebot' })
    expect(summeNetto(p)).toBe(4500)
  })
  it('Kran: Tage mal Tagessatz', () => {
    const p = baueRechnungsPositionen({ eingabe: eingabe({ kranAktiv: true, kranTage: 3, kranTagessatz: 850 }), basis: 'angebot' })
    expect(summeNetto(p)).toBe(5000 + 2550)
  })
  it('Aufmaß-Basis rechnet Fläche mal Preis, auf Cent gerundet', () => {
    const p = baueRechnungsPositionen({ eingabe: eingabe(), basis: 'aufmass', aufmassM2: 123.456, aufmassPreisProM2: 7.777 })
    expect(p[0]).toMatchObject({ menge: 123.46, einzelpreis: 7.78 })
    expect(summeNetto(p)).toBe(960.52) // 123,46 × 7,78 – gerechnet mit den auf der Rechnung gedruckten Werten
  })
  it('ohne Daten entsteht keine Rechnung über NaN', () => {
    const p = baueRechnungsPositionen({ eingabe: eingabe({ kiResult: null }), basis: 'angebot' })
    expect(Number.isFinite(summeNetto(p))).toBe(true)
  })
})

describe('Abschläge', () => {
  const ab = (extra = {}) => ({ id: 'a1', invoice_number: 'RE-1', invoice_date: '2026-09-01', net_amount: 1000, tax_rate: 19, tax_amount: 190, gross_amount: 1190, status: 'bezahlt', paid_amount: 0, ...extra })

  it('bezahlter Abschlag wird voll netto abgezogen, USt getrennt ausgewiesen', () => {
    const a = abschlagAbzug(ab())
    expect(a).toMatchObject({ netto: 1000, ust: 190, brutto: 1190, gezahlt: true, teilweise: false, abziehbar: true })
  })
  it('Teilzahlung wird anteilig abgezogen', () => {
    const a = abschlagAbzug(ab({ status: 'offen', paid_amount: 595 }))
    expect(a).toMatchObject({ netto: 500, brutto: 595, teilweise: true })
    expect(a.ust).toBeCloseTo(95, 2)
  })
  it('Überzahlung wird auf den Rechnungsbetrag begrenzt, negative Zahlung auf 0', () => {
    expect(abschlagAbzug(ab({ status: 'offen', paid_amount: 5000 })).brutto).toBe(1190)
    expect(abschlagAbzug(ab({ status: 'offen', paid_amount: -50 })).gezahlt).toBe(false)
  })
  it('unbezahlter Abschlag: voller Betrag, aber als "noch nicht bezahlt" gekennzeichnet', () => {
    const a = abschlagAbzug(ab({ status: 'offen', paid_amount: 0 }))
    expect(a).toMatchObject({ gezahlt: false, netto: 1000 })
    expect(baueAbzugsPositionen([a])[0].bezeichnung).toContain('noch nicht bezahlt')
  })
  it('anderer Steuersatz ist nicht abziehbar', () => {
    expect(abschlagAbzug(ab({ tax_rate: 7 })).abziehbar).toBe(false)
  })
  it('Abzugsposition ist negativ, und Schlussrechnung = Gesamtleistung minus Abschlag netto', () => {
    const pos = [...baueRechnungsPositionen({ eingabe: eingabe(), basis: 'angebot' }), ...baueAbzugsPositionen([abschlagAbzug(ab())])]
    expect(summeNetto(pos)).toBe(4000)
  })
  it('Abzug höher als Gesamtleistung wird erkannt', () => {
    expect(istAbzugZuHoch(1000, [abschlagAbzug(ab())])).toBe(true)
    expect(istAbzugZuHoch(5000, [abschlagAbzug(ab())])).toBe(false)
    expect(istAbzugZuHoch(5000, [])).toBe(false)
  })
})
