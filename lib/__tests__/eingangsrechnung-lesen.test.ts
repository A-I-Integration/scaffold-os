import { describe, it, expect } from 'vitest'
import { leseRechnung, leseText, leseXml } from '../eingangsrechnung-lesen'

const STANDARD = `Baustoff Müller GmbH · Hauptstraße 1 · 48691 Vreden
Musterfirma Gerüstbau
Rechnung
Rechnungsnummer: RE-2026-0815
Rechnungsdatum: 12.11.2026
Pos Bezeichnung Menge Preis
1 Kantholz 100 4,00 400,00
Zwischensumme netto 1.000,00 €
19 % MwSt. 190,00 €
Gesamtbetrag brutto 1.190,00 €
Zahlbar innerhalb von 14 Tagen ohne Abzug.`

describe('leseText', () => {
  it('liest eine übliche Rechnung vollständig', () => {
    const r = leseText(STANDARD)
    expect(r.quelle).toBe('text')
    expect(r.felder).toMatchObject({ rechnungsnummer: 'RE-2026-0815', rechnungsdatum: '2026-11-12', faellig_am: '2026-11-26', netto: 1000, ust_satz: 19, brutto: 1190, lieferant: 'Baustoff Müller GmbH' })
    expect(r.pruefen).toEqual(['lieferant']) // Lieferant ist immer eine Vermutung
  })
  it('7 % und Fälligkeitsdatum', () => {
    const r = leseText(`Holz Meier KG\nInvoice No. 4711\nDatum: 01.10.2026\nNettobetrag 100,00\nMwSt 7 % 7,00\nZu zahlen 107,00\nFällig am 15.10.2026\nSeite 1 von 1 Danke für Ihren Auftrag`)
    expect(r.felder).toMatchObject({ netto: 100, ust_satz: 7, brutto: 107, faellig_am: '2026-10-15', rechnungsnummer: '4711' })
  })
  it('Reverse Charge §13b: 0 % und Netto = Brutto', () => {
    const r = leseText(`Bau Service GmbH\nRechnungs-Nr. 99-1\nRechnungsdatum 05.11.2026\nSteuerschuldnerschaft des Leistungsempfängers gemäß § 13b UStG\nGesamtbetrag 2.500,00 €\nVielen Dank für Ihren Auftrag, bitte überweisen.`)
    expect(r.felder).toMatchObject({ netto: 2500, brutto: 2500, ust_satz: 0 })
  })
  it('rechnet Netto aus Brutto minus USt, wenn Netto fehlt, und markiert es zur Prüfung', () => {
    const r = leseText(`Firma Beispiel GmbH\nRechnung Nr. 12\nDatum 02.11.2026\n19 % MwSt 38,00\nGesamtbetrag 238,00 €\nMit freundlichen Grüßen Ihre Firma Beispiel`)
    expect(r.felder).toMatchObject({ netto: 200, brutto: 238, ust_satz: 19 })
    expect(r.pruefen).toContain('netto')
  })
  it('Betragssumme passt nicht zusammen → nichts als sicher ausgeben', () => {
    const r = leseText(`Firma X GmbH\nRechnungsnummer: A1\nNetto 100,00\nGesamtbetrag 500,00\nSeite 1 Danke für Ihren Auftrag bei uns heute`)
    expect(r.pruefen).toEqual(expect.arrayContaining(['netto', 'brutto']))
  })
  it('PDF ohne Text → leer mit Hinweis', () => {
    const r = leseText('   ')
    expect(r.quelle).toBe('leer'); expect(r.hinweis).toMatch(/eingescannt/)
  })
  it('erfindet kein Datum aus ungültigen Angaben', () => {
    const r = leseText(`Firma Y GmbH\nRechnungsdatum: 31.02.2026\nNetto 10,00\n19 % MwSt 1,90\nBrutto 11,90\nzusätzlicher Text damit genug Zeichen da sind`)
    expect(r.felder.rechnungsdatum).toBeUndefined()
  })
})

const CII = `<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocument><ram:ID>R-77</ram:ID><ram:IssueDateTime><udt:DateTimeString format="102">20261112</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction><ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty><ram:Name>Lieferant AG</ram:Name></ram:SellerTradeParty></ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeSettlement><ram:ApplicableTradeTax><ram:RateApplicablePercent>19.00</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261126</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>500.00</ram:TaxBasisTotalAmount><ram:GrandTotalAmount>595.00</ram:GrandTotalAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
</ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`

describe('leseXml / leseRechnung', () => {
  it('liest ZUGFeRD/CII', () => {
    const r = leseXml(CII)!
    expect(r.quelle).toBe('xml')
    expect(r.felder).toEqual({ lieferant: 'Lieferant AG', rechnungsnummer: 'R-77', rechnungsdatum: '2026-11-12', faellig_am: '2026-11-26', netto: 500, brutto: 595, ust_satz: 19 })
    expect(r.pruefen).toEqual([])
  })
  it('kein XML / fremdes XML → null', () => {
    expect(leseXml('kein xml')).toBeNull()
    expect(leseXml('<a><b>1</b></a>')).toBeNull()
  })
  it('XML hat Vorrang vor dem Text', () => {
    const r = leseRechnung({ text: STANDARD, xml: CII })
    expect(r.quelle).toBe('xml'); expect(r.felder.netto).toBe(500); expect(r.felder.lieferant).toBe('Lieferant AG')
  })
  it('ohne XML gilt der Text', () => { expect(leseRechnung({ text: STANDARD }).felder.netto).toBe(1000) })
})

describe('weitere Felder', () => {
  const VOLL = `Muster Gerüstbau GmbH · Weg 2 · 48691 Vreden
Rechnungsnummer: RE-2026-1048
Rechnungsdatum: 25.11.2026
Leistungsdatum: 20.11.2026
Kundennummer: K-4711
Pos Bezeichnung Menge Einzelpreis Gesamt
1 Gerüstmaterial 10 Stk 50,00 500,00
2 Transport 1 200,00 200,00
3 Montage 20 h 15,00 300,00
Nettobetrag 1.000,00 €
19 % MwSt. 190,00 €
Gesamtbetrag 1.190,00 €
Zahlbar bis 10.12.2026
IBAN: DE89 3704 0044 0532 0130 00`
  it('liest IBAN (mit Prüfsumme), Leistungsdatum, Kundennummer und Positionen', () => {
    const r = leseText(VOLL)
    expect(r.felder).toMatchObject({ iban: 'DE89370400440532013000', leistungsdatum: '2026-11-20', kundennummer: 'K-4711', faellig_am: '2026-12-10', netto: 1000, brutto: 1190 })
    expect(r.felder.positionen).toEqual([
      { bezeichnung: 'Gerüstmaterial', menge: 10, einheit: 'Stk', einzelpreis: 50, gesamt: 500 },
      { bezeichnung: 'Transport', menge: 1, einheit: null, einzelpreis: 200, gesamt: 200 },
      { bezeichnung: 'Montage', menge: 20, einheit: 'h', einzelpreis: 15, gesamt: 300 },
    ])
  })
  it('lehnt IBAN mit falscher Prüfsumme ab', () => {
    expect(leseText(VOLL.replace('DE89 3704 0044 0532 0130 00', 'DE89 3704 0044 0532 0130 01')).felder.iban).toBeUndefined()
  })
  it('verwirft Positionen, deren Summe nicht zum Netto passt', () => {
    expect(leseText(VOLL.replace('Montage 20 h 15,00 300,00', 'Montage 20 h 15,00 100,00').replace('300,00','100,00')).felder.positionen).toBeUndefined()
  })
  it('OCR-Ergebnis: alles gefundene wird zur Kontrolle markiert', () => {
    const r = leseRechnung({ text: VOLL, ocr: true })
    expect(r.quelle).toBe('ocr')
    expect(r.pruefen).toEqual(expect.arrayContaining(['netto', 'brutto', 'rechnungsnummer', 'iban']))
  })
})
