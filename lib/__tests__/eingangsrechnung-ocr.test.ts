import { describe, it, expect } from 'vitest'
import { leseRechnung } from '../eingangsrechnung-lesen'

// Echte Ausgabe der Texterkennung (Tesseract, deutsch) auf einer gerenderten Beispielrechnung, inkl. typischer Fehler bei Umlauten
const OCR = `Baustoff MCYaller GmbH Ä- HauptstraC#4e 1 A. 48691 Vreden
Rechnungsnummer: RE-2026-0815

Rechnungsdatum: 12.11.2026

Zwischensumme netto 1.000,00 EUR

19 % MwSt. 190,00 EUR

Gesamtbetrag brutto 1.190,00 EUR

IBAN: DE89 3704 0044 0532 0130 00
`
describe('Texterkennung → Felder', () => {
  it('liest Zahlen trotz Umlautfehlern und markiert alles zur Kontrolle', () => {
    const r = leseRechnung({ text: OCR, ocr: true })
    expect(r.quelle).toBe('ocr')
    expect(r.felder).toMatchObject({ rechnungsnummer: 'RE-2026-0815', rechnungsdatum: '2026-11-12', netto: 1000, ust_satz: 19, brutto: 1190, iban: 'DE89370400440532013000' })
    expect(r.pruefen).toEqual(expect.arrayContaining(['lieferant', 'netto', 'brutto']))
  })
})
