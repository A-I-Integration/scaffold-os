import { describe, it, expect } from 'vitest'
import { parseZahl, parseDatum, pruefeBaustelle, pruefeAltrechnung } from '@/lib/import-altdaten'

describe('parseZahl', () => {
  it('liest deutsche und englische Schreibweisen', () => {
    expect(parseZahl('1.234,56')).toBe(1234.56)
    expect(parseZahl('1234,5')).toBe(1234.5)
    expect(parseZahl('1 234,56 €')).toBe(1234.56)
    expect(parseZahl('1,234.56')).toBe(1234.56)
    expect(parseZahl('-12,50')).toBe(-12.5)
    expect(parseZahl('1.234')).toBe(1234)
    expect(parseZahl('0,19')).toBe(0.19)
  })
  it('lehnt Unsinn ab', () => {
    for (const v of ['', 'abc', '1,2,3x', null, undefined]) expect(parseZahl(v)).toBeNull()
  })
})

describe('parseDatum', () => {
  it('liest gängige Formate', () => {
    expect(parseDatum('26.10.2026')).toBe('2026-10-26')
    expect(parseDatum('1.2.26')).toBe('2026-02-01')
    expect(parseDatum('2026-10-26')).toBe('2026-10-26')
    expect(parseDatum('2026-10-26 12:00:00')).toBe('2026-10-26')
  })
  it('lehnt ungültige Tage ab', () => {
    expect(parseDatum('31.02.2026')).toBeNull()
    expect(parseDatum('xx')).toBeNull()
    expect(parseDatum('13.13.2026')).toBeNull()
  })
})

describe('pruefeBaustelle', () => {
  it('nimmt eine vollständige Zeile an', () => {
    const r = pruefeBaustelle({ kunde: ' Müller GmbH ', name: 'Neubau Süd', adresse: 'Hauptstr. 1', beginn: '01.03.2026', ende: '30.04.2026', status: 'abgeschlossen' })
    expect(r).toEqual({ ok: true, wert: { kunde: 'Müller GmbH', name: 'Neubau Süd', adresse: 'Hauptstr. 1', beginn: '2026-03-01', ende: '2026-04-30', abgeschlossen: true } })
  })
  it('meldet Pflichtfelder und unlesbare Daten', () => {
    expect(pruefeBaustelle({ name: 'x' })).toMatchObject({ ok: false, grund: 'Kunde fehlt' })
    expect(pruefeBaustelle({ kunde: 'k' })).toMatchObject({ ok: false })
    expect(pruefeBaustelle({ kunde: 'k', name: 'n', beginn: 'bald' }).ok).toBe(false)
  })
})

describe('pruefeAltrechnung', () => {
  const basis = { nummer: '2025-0117', kunde: 'Müller GmbH', datum: '15.12.2025' }
  it('rechnet Brutto aus Netto (19 %) und markiert offen', () => {
    const r = pruefeAltrechnung({ ...basis, netto: '1.000,00' })
    expect(r).toMatchObject({ ok: true, wert: { netto: 1000, steuer: 190, brutto: 1190, steuersatz: 19, status: 'offen', bezahlt: 0, art: 'standard' } })
  })
  it('rechnet Netto aus Brutto', () => {
    expect(pruefeAltrechnung({ ...basis, brutto: '1.190,00' })).toMatchObject({ ok: true, wert: { netto: 1000, steuer: 190 } })
  })
  it('bezahlt, Teilzahlung über offenen Betrag, storniert', () => {
    expect(pruefeAltrechnung({ ...basis, netto: '100', status: 'bezahlt' })).toMatchObject({ ok: true, wert: { status: 'bezahlt', bezahlt: 119 } })
    expect(pruefeAltrechnung({ ...basis, netto: '100', offen: '19' })).toMatchObject({ ok: true, wert: { status: 'offen', bezahlt: 100 } })
    expect(pruefeAltrechnung({ ...basis, netto: '100', offen: '0' })).toMatchObject({ ok: true, wert: { status: 'bezahlt' } })
    expect(pruefeAltrechnung({ ...basis, netto: '100', status: 'unbezahlt' })).toMatchObject({ ok: true, wert: { status: 'offen', bezahlt: 0 } })
    expect(pruefeAltrechnung({ ...basis, netto: '100', status: 'storniert' })).toMatchObject({ ok: true, wert: { status: 'storniert', bezahlt: 0 } })
  })
  it('negative Beträge sind Gutschriften', () => {
    expect(pruefeAltrechnung({ ...basis, netto: '-100' })).toMatchObject({ ok: true, wert: { art: 'gutschrift', brutto: -119 } })
  })
  it('meldet Fehler', () => {
    expect(pruefeAltrechnung({ ...basis }).ok).toBe(false)
    expect(pruefeAltrechnung({ ...basis, datum: 'x', netto: '1' }).ok).toBe(false)
    expect(pruefeAltrechnung({ nummer: '', kunde: 'k', datum: '1.1.2026', netto: '1' }).ok).toBe(false)
    expect(pruefeAltrechnung({ ...basis, netto: '1', steuersatz: '99' }).ok).toBe(false)
  })
})
