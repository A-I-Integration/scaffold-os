import { describe, it, expect } from 'vitest'
import { steuerFall, einheitZuUnitCode, zerlegeAdresse, leistungsdatumFuer, pruefePflichtangaben } from '../rechnung-steuer'
import { HINWEIS_13B } from '../ust-hinweis'

const cs = { company_name: 'Test GmbH', street: 'Weg 1', zip: '48691', city: 'Vreden', steuer_nr: '1/2/3', ust_id: 'DE1' }
const basis = { invoice_number: 'RE-1', invoice_date: '2026-11-19', customer_name: 'K', customer_address: 'Str 1\n48143 Münster', positions: [{ bezeichnung: 'Gerüst', menge: 1 }], tax_rate: 19, gross_amount: 1000, company_snapshot: cs }

describe('Steuerfall', () => {
  it('19 % = Regelsteuer; 0 wird nicht zu 19', () => {
    expect(steuerFall({ tax_rate: 19 }).kategorie).toBe('S')
    expect(steuerFall({ tax_rate: 7 }).satz).toBe(7)
    expect(steuerFall({ tax_rate: 0, notes: HINWEIS_13B })).toMatchObject({ kategorie: 'AE', satz: 0 })
    expect(steuerFall({ tax_rate: '0', notes: null }).satz).toBe(0)
  })
  it('0 % ohne Hinweis hat keinen Befreiungsgrund; Kleinunternehmer erkannt', () => {
    expect(steuerFall({ tax_rate: 0 }).grund).toBeUndefined()
    expect(steuerFall({ tax_rate: 0, notes: 'Kleinunternehmer gemäß § 19 UStG' }).grund).toContain('§ 19')
  })
})

describe('Einheit und Adresse', () => {
  it('ordnet gängige Einheiten zu', () => {
    expect(einheitZuUnitCode('m²')).toBe('MTK'); expect(einheitZuUnitCode('Std.')).toBe('HUR'); expect(einheitZuUnitCode('Pauschale')).toBe('LS')
    expect(einheitZuUnitCode('Wo.')).toBe('WEE'); expect(einheitZuUnitCode('Stk.')).toBe('H87'); expect(einheitZuUnitCode('xyz')).toBe('C62')
  })
  it('zerlegt PLZ und Ort', () => {
    expect(zerlegeAdresse('Baustellenstraße 25\n48143 Münster')).toEqual({ line1: 'Baustellenstraße 25', postalCode: '48143', city: 'Münster' })
    expect(zerlegeAdresse('Weg 1, 48691 Vreden')).toEqual({ line1: 'Weg 1', postalCode: '48691', city: 'Vreden' })
    expect(zerlegeAdresse('Unklar', 'K')).toEqual({ line1: 'Unklar', postalCode: '', city: '' })
  })
})

describe('Leistungsdatum und Pflichtangaben', () => {
  it('ohne eigene Angabe gilt das Rechnungsdatum', () => {
    expect(leistungsdatumFuer({ invoice_date: '2026-11-19' })).toEqual({ datum: '2026-11-19', eigene: false })
    expect(leistungsdatumFuer({ invoice_date: '2026-11-19', leistungsdatum: '2026-11-18' }).eigene).toBe(true)
  })
  it('vollständige Rechnung hat keine Lücke', () => { expect(pruefePflichtangaben(basis)).toEqual([]) })
  it('meldet fehlende Angaben', () => {
    const codes = pruefePflichtangaben({ ...basis, company_snapshot: { company_name: 'X' }, customer_address: '', positions: [{ bezeichnung: '' }] }).map((x) => x.code)
    expect(codes).toEqual(expect.arrayContaining(['AUSSTELLER_ANSCHRIFT', 'STEUERNUMMER', 'EMPFAENGER_ANSCHRIFT', 'LEISTUNGSBESCHREIBUNG']))
  })
  it('0 % braucht Grund; Gutschrift braucht Bezug; Kleinbetrag ohne Empfängeranschrift ok', () => {
    expect(pruefePflichtangaben({ ...basis, tax_rate: 0 }).map((x) => x.code)).toContain('STEUERBEFREIUNG')
    expect(pruefePflichtangaben({ ...basis, tax_rate: 0, notes: HINWEIS_13B })).toEqual([])
    expect(pruefePflichtangaben({ ...basis, invoice_type: 'gutschrift' }).map((x) => x.code)).toContain('GUTSCHRIFT_BEZUG')
    expect(pruefePflichtangaben({ ...basis, gross_amount: 100, customer_address: '' })).toEqual([])
  })
})

import { aufbewahrungsHinweis, HINWEIS_AUFBEWAHRUNG, HINWEIS_19 } from '../rechnung-steuer'
import { notizMitSteuerHinweis } from '../ust-hinweis'

describe('Steuerbehandlung und Aufbewahrungshinweis', () => {
  it('gewählte Steuerbehandlung hat Vorrang vor dem Hinweistext', () => {
    expect(steuerFall({ tax_rate: 0, steuerfall: '13b', notes: null }).kategorie).toBe('AE')
    expect(steuerFall({ tax_rate: 0, steuerfall: 'kleinunternehmer', notes: HINWEIS_13B }).kategorie).toBe('E')
    expect(steuerFall({ tax_rate: 0, steuerfall: 'regel', notes: HINWEIS_13B }).grund).toBeUndefined()
    expect(steuerFall({ tax_rate: 19, steuerfall: '13b' }).kategorie).toBe('S')
  })
  it('Hinweis zur Steuerbehandlung nur bei 0 %, ohne Doppelung', () => {
    expect(notizMitSteuerHinweis('x', 0, 'kleinunternehmer')).toBe(`${HINWEIS_19}\nx`)
    expect(notizMitSteuerHinweis(HINWEIS_19, 0, 'kleinunternehmer')).toBe(HINWEIS_19)
    expect(notizMitSteuerHinweis('x', 19, 'kleinunternehmer')).toBe('x')
    expect(notizMitSteuerHinweis(null, 0, '13b')).toContain('§ 13b')
    expect(notizMitSteuerHinweis('x', 0, 'regel')).toBe('x')
  })
  it('Aufbewahrungshinweis nur für Privatpersonen', () => {
    expect(aufbewahrungsHinweis({ customer_privat: true })).toBe(HINWEIS_AUFBEWAHRUNG)
    expect(aufbewahrungsHinweis({ customer_privat: false })).toBeNull()
    expect(aufbewahrungsHinweis({})).toBeNull()
  })
})
