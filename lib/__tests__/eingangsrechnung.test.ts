import { describe, it, expect } from 'vitest'
import { berechneBrutto, eingangPfad, parseBetrag, pruefeEingangsrechnung, summiereEingang } from '../eingangsrechnung'
import { berechneBaustellenErgebnis } from '../baustellen-ergebnis'

const ok = { lieferant: 'Baustoff Müller GmbH', art: 'material', netto: '1.000,00', ust_satz: '19' }

describe('parseBetrag', () => {
  it('liest deutsche und englische Schreibweise', () => {
    expect(parseBetrag('1.234,56')).toBe(1234.56)
    expect(parseBetrag('1234.56')).toBe(1234.56)
    expect(parseBetrag('1234,5 €')).toBe(1234.5)
    expect(parseBetrag('1.234.567')).toBe(1234567)
    expect(parseBetrag(12)).toBe(12)
  })
  it('lehnt Unsinn ab', () => {
    expect(parseBetrag('')).toBeNull()
    expect(parseBetrag('abc')).toBeNull()
    expect(parseBetrag(null)).toBeNull()
    expect(parseBetrag('12,3,4')).toBeNull()
  })
})

describe('berechneBrutto', () => {
  it('rechnet USt und Brutto kaufmännisch gerundet', () => {
    expect(berechneBrutto(1000, 19)).toEqual({ ust_betrag: 190, brutto: 1190 })
    expect(berechneBrutto(33.33, 19)).toEqual({ ust_betrag: 6.33, brutto: 39.66 })
    expect(berechneBrutto(500, 0)).toEqual({ ust_betrag: 0, brutto: 500 })
  })
})

describe('pruefeEingangsrechnung', () => {
  it('akzeptiert Mindestangaben und rechnet Brutto selbst (Fremdwerte werden ignoriert)', () => {
    const r = pruefeEingangsrechnung({ ...ok, brutto: 1, ust_betrag: 1 })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.werte.netto).toBe(1000); expect(r.werte.brutto).toBe(1190); expect(r.werte.status).toBe('offen'); expect(r.werte.rechnungsdatum).toBeNull() }
  })
  it('USt-Satz fehlt → 19 %; 0 % bleibt 0 (Reverse Charge)', () => {
    const a = pruefeEingangsrechnung({ lieferant: 'X', art: 'sonstiges', netto: 100 })
    expect(a.ok && a.werte.ust_satz).toBe(19)
    const b = pruefeEingangsrechnung({ lieferant: 'X', art: 'nachunternehmer', netto: 100, ust_satz: '0' })
    expect(b.ok && b.werte.brutto).toBe(100)
  })
  it('verlangt Lieferant, gültige Art und Netto', () => {
    expect(pruefeEingangsrechnung({ ...ok, lieferant: '  ' }).ok).toBe(false)
    expect(pruefeEingangsrechnung({ ...ok, art: 'kaffee' }).ok).toBe(false)
    expect(pruefeEingangsrechnung({ ...ok, netto: '' }).ok).toBe(false)
    expect(pruefeEingangsrechnung({ ...ok, netto: '-5' }).ok).toBe(false)
    expect(pruefeEingangsrechnung({ ...ok, ust_satz: '150' }).ok).toBe(false)
  })
  it('prüft Datumsangaben streng', () => {
    expect(pruefeEingangsrechnung({ ...ok, rechnungsdatum: '2026-11-27' }).ok).toBe(true)
    expect(pruefeEingangsrechnung({ ...ok, rechnungsdatum: '2026-02-30' }).ok).toBe(false)
    expect(pruefeEingangsrechnung({ ...ok, rechnungsdatum: '27.11.2026' }).ok).toBe(false)
    expect(pruefeEingangsrechnung({ ...ok, faellig_am: 'morgen' }).ok).toBe(false)
  })
  it('bezahlt_am gilt nur bei Status bezahlt', () => {
    const a = pruefeEingangsrechnung({ ...ok, status: 'offen', bezahlt_am: '2026-11-01' })
    expect(a.ok && a.werte.bezahlt_am).toBeNull()
    const b = pruefeEingangsrechnung({ ...ok, status: 'bezahlt', bezahlt_am: '2026-11-01' })
    expect(b.ok && b.werte.bezahlt_am).toBe('2026-11-01')
  })
  it('lehnt ungültige Nachunternehmer-ID ab', () => {
    expect(pruefeEingangsrechnung({ ...ok, subcontractor_id: 'x; drop table' }).ok).toBe(false)
    expect(pruefeEingangsrechnung({ ...ok, subcontractor_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).ok).toBe(true)
  })
})

describe('summiereEingang', () => {
  it('summiert netto je Art; offen zählt nur unbezahlte brutto', () => {
    const s = summiereEingang([
      { art: 'material', netto: 100, brutto: 119, status: 'offen' },
      { art: 'nachunternehmer', netto: 1000, brutto: 1190, status: 'bezahlt' },
      { art: 'nachunternehmer', netto: 50.5, brutto: 60.1, status: 'offen' },
    ])
    expect(s).toMatchObject({ anzahl: 3, netto: 1150.5, brutto: 1369.1, offenBrutto: 179.1 })
    expect(s.je).toEqual({ nachunternehmer: 1050.5, material: 100, sonstiges: 0 })
  })
  it('leere Liste ergibt Nullen', () => { expect(summiereEingang([]).netto).toBe(0) })
})

describe('eingangPfad', () => {
  it('liegt unter eingang/<Baustelle>/ und säubert den Dateinamen', () => {
    expect(eingangPfad('p1', 'i1', '../Rechnung Nr 1 äöü.pdf')).toBe('eingang/p1/i1-Rechnung_Nr_1_aou.pdf')
  })
})

describe('Fremdkosten im Baustellenergebnis', () => {
  it('mindern das Ergebnis, ohne Lohnnebenkosten-Zuschlag', () => {
    const r = berechneBaustellenErgebnis({ erloesNetto: 2000, zeilen: [{ id: 'a', name: 'A', stunden: 10, satz: 30 }], zuschlagProzent: 20, fremdkostenNetto: 400 })
    expect(r.fremdkosten).toBe(400)
    expect(r.kostenGesamt).toBe(760) // 360 + 400
    expect(r.ergebnis).toBe(1240)
  })
  it('ohne Fremdkosten unverändert', () => {
    const r = berechneBaustellenErgebnis({ erloesNetto: 1000, zeilen: [{ id: 'a', name: 'A', stunden: 10, satz: 30 }] })
    expect(r.fremdkosten).toBe(0); expect(r.ergebnis).toBe(700)
  })
})

import { ibanGueltig, ibanFormat } from '../eingangsrechnung'
describe('IBAN und neue Felder', () => {
  it('prüft die Prüfsumme', () => {
    expect(ibanGueltig('DE89 3704 0044 0532 0130 00')).toBe(true)
    expect(ibanGueltig('DE89370400440532013001')).toBe(false)
    expect(ibanGueltig('abc')).toBe(false)
    expect(ibanFormat('de89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00')
  })
  it('übernimmt IBAN, Leistungsdatum, Kundennummer, Positionen; lehnt falsche IBAN ab', () => {
    const r = pruefeEingangsrechnung({ lieferant: 'X', art: 'material', netto: 100, iban: 'de89 3704 0044 0532 0130 00', leistungsdatum: '2026-11-20', kundennummer: ' K1 ', positionen: [{ bezeichnung: 'A', menge: 1, einzelpreis: 100, gesamt: 100 }] })
    expect(r.ok && r.werte).toMatchObject({ iban: 'DE89370400440532013000', leistungsdatum: '2026-11-20', kundennummer: 'K1' })
    expect(pruefeEingangsrechnung({ lieferant: 'X', art: 'material', netto: 100, iban: 'DE00 1111' }).ok).toBe(false)
    expect(pruefeEingangsrechnung({ lieferant: 'X', art: 'material', netto: 100, positionen: [{ bezeichnung: '', menge: 1, einzelpreis: 1, gesamt: 1 }] }).ok).toBe(false)
  })
})
