import { describe, it, expect } from 'vitest'
import { freibetrag, pfaendbarerBetrag, grenzeFuer, berechnePfaendung, pruefePfaendung, pruefePfaendungMonat, STANDARD_GRENZEN } from '../pfaendung'
import { pruefeSonderzahlung, lohnHinweise, SONDERZAHLUNG_ARTEN } from '../konditionen'

const G26 = STANDARD_GRENZEN[1]
const P = (o: Partial<any> = {}) => ({ id: 'p1', glaeubiger: 'Bank A', rang: 1, unterhaltspersonen: 0, gueltig_ab: '2026-01-01', ...o })

describe('Pfändung § 850c ZPO', () => {
  it('Freibeträge ab 1.7.2026: 1587,40 / 2184,82 / 2517,65 / 2850,48 / 3183,31 / 3516,14', () => {
    expect([0, 1, 2, 3, 4, 5].map(n => freibetrag(n, G26))).toEqual([1587.4, 2184.82, 2517.65, 2850.48, 3183.31, 3516.14])
    expect(freibetrag(9, G26)).toBe(3516.14)
  })
  it('pfändbarer Betrag: 70 % / 50 % / … des Mehrbetrags', () => {
    expect(pfaendbarerBetrag(2000, 0, G26)).toBe(288.82)
    expect(pfaendbarerBetrag(2500, 1, G26)).toBe(157.59)
    expect(pfaendbarerBetrag(3000, 3, G26)).toBe(44.86)
    expect(pfaendbarerBetrag(1587.4, 0, G26)).toBe(0)
    expect(pfaendbarerBetrag(1000, 0, G26)).toBe(0)
  })
  it('über der Obergrenze ist der Mehrbetrag voll pfändbar', () => {
    expect(pfaendbarerBetrag(4866.3, 0, G26)).toBe(2295.23)
    expect(pfaendbarerBetrag(5000, 0, G26)).toBe(2428.93)
  })
  it('Grenze nach Gültig-ab: Juni 2026 noch die alte, Juli neue', () => {
    expect(grenzeFuer('2026-06')?.grundbetrag).toBe(1555)
    expect(grenzeFuer('2026-07')?.grundbetrag).toBe(1587.4)
    expect(grenzeFuer('2025-01')).toBeNull()
  })
  it('Verteilung nach Rang mit offener Forderung', () => {
    const r = berechnePfaendung(2000, '2026-08', [P({ id: 'a', glaeubiger: 'A', rang: 1, forderung_offen: 100 }), P({ id: 'b', glaeubiger: 'B', rang: 2 })])!
    expect(r.pfaendbar).toBe(288.82)
    expect(r.verteilung).toEqual([{ id: 'a', glaeubiger: 'A', betrag: 100 }, { id: 'b', glaeubiger: 'B', betrag: 188.82 }])
    expect(r.nichtVerteilt).toBe(0)
  })
  it('alle Forderungen gedeckt: Rest bleibt unverteilt und wird gemeldet', () => {
    const r = berechnePfaendung(2000, '2026-08', [P({ forderung_offen: 50 })])!
    expect(r.nichtVerteilt).toBe(238.82)
    expect(r.hinweise.join(' ')).toContain('keiner Forderung')
  })
  it('Handbetrag überschreibt und wird gekennzeichnet', () => {
    const r = berechnePfaendung(2000, '2026-08', [P()], STANDARD_GRENZEN, 250)!
    expect(r).toMatchObject({ einbehalt: 250, manuell: true, pfaendbar: 288.82 })
    expect(r.hinweise[0]).toContain('288,82')
  })
  it('keine Pfändung in dem Monat → null; beendete Pfändung zählt nicht', () => {
    expect(berechnePfaendung(2000, '2026-08', [])).toBeNull()
    expect(berechnePfaendung(2000, '2026-08', [P({ gueltig_bis: '2026-07-31' })])).toBeNull()
    expect(berechnePfaendung(2000, '2026-12', [P({ gueltig_ab: '2027-01-01' })])).toBeNull()
  })
  it('Eingaben prüfen', () => {
    expect(pruefePfaendung({ glaeubiger: '', gueltig_ab: '2026-01-01' }).ok).toBe(false)
    expect(pruefePfaendung({ glaeubiger: 'X', unterhaltspersonen: 6, gueltig_ab: '2026-01-01' }).ok).toBe(false)
    expect(pruefePfaendung({ glaeubiger: 'X', gueltig_ab: '2026-02-01', gueltig_bis: '2026-01-01' }).ok).toBe(false)
    expect(pruefePfaendung({ glaeubiger: ' X ', unterhaltspersonen: '2', rang: '', forderung_offen: '1.234,50', gueltig_ab: '2026-01-01' })).toMatchObject({ ok: true, glaeubiger: 'X', unterhaltspersonen: 2, rang: 1, forderung_offen: 1234.5 })
    expect(pruefePfaendungMonat({ monat: '2026-08', netto: '2000', betrag_manuell: '300' }).ok).toBe(false)
    expect(pruefePfaendungMonat({ monat: '2026-08', netto: '2000', betrag_manuell: '3000', begruendung: 'x' }).ok).toBe(false)
    expect(pruefePfaendungMonat({ monat: '2026-08', netto: '2000,50' })).toMatchObject({ ok: true, netto: 2000.5, betrag_manuell: null })
  })
})

describe('Zulagen', () => {
  it('neue Arten sind wählbar', () => {
    for (const a of ['gutschein', 'tankrabatt', 'kilometergeld', 'geburt', 'geburtstag', 'zulage']) expect(SONDERZAHLUNG_ARTEN.some(x => x.value === a)).toBe(true)
  })
  it('Kilometergeld: km mal Satz; Handbetrag hat Vorrang; ohne km Fehler', () => {
    expect(pruefeSonderzahlung({ art: 'kilometergeld', monat: '2026-11', menge: '120,5', satz: '0,30' })).toMatchObject({ ok: true, betrag: 36.15, menge: 120.5, satz: 0.3 })
    expect(pruefeSonderzahlung({ art: 'kilometergeld', monat: '2026-11', menge: '100', betrag: '25' })).toMatchObject({ ok: true, betrag: 25, menge: 100, satz: null })
    expect(pruefeSonderzahlung({ art: 'kilometergeld', monat: '2026-11', satz: '0,30' }).ok).toBe(false)
    expect(pruefeSonderzahlung({ art: 'kilometergeld', monat: '2026-11', menge: '100' }).ok).toBe(false)
    expect(pruefeSonderzahlung({ art: 'gutschein', monat: '2026-11', betrag: '30' })).toMatchObject({ ok: true, betrag: 30, menge: null, satz: null })
  })
  it('Hinweise: Sachbezüge über 50 € im Monat, Geschenke über 60 €', () => {
    expect(lohnHinweise([{ art: 'gutschein', betrag: 30, monat: '2026-11' }, { art: 'tankrabatt', betrag: 25, monat: '2026-11' }], '2026-11')).toHaveLength(1)
    expect(lohnHinweise([{ art: 'gutschein', betrag: 30, monat: '2026-11' }, { art: 'tankrabatt', betrag: 25, monat: '2026-10' }], '2026-11')).toHaveLength(0)
    expect(lohnHinweise([{ art: 'geburtstag', betrag: 61, monat: '2026-11' }], '2026-11')).toHaveLength(1)
    expect(lohnHinweise([{ art: 'geburt', betrag: 60, monat: '2026-11' }], '2026-11')).toHaveLength(0)
  })
})
