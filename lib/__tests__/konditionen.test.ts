import { describe, it, expect } from 'vitest'
import { pruefeSonderzahlung, pruefeUrlaubsanspruch, pruefeKonditionen, urlaubsanspruchAm } from '../konditionen'

describe('Konditionen-Prüfung', () => {
  it('Sonderzahlung: gültige Eingabe mit und ohne Betrag', () => {
    expect(pruefeSonderzahlung({ art: 'urlaubsgeld', monat: '2026-06', betrag: '1.250,50' })).toMatchObject({ ok: true, betrag: 1250.5, monat: '2026-06', bezeichnung: null })
    expect(pruefeSonderzahlung({ art: 'praemie', monat: '2026-12' })).toMatchObject({ ok: true, betrag: null })
  })
  it.each([
    [{ art: 'x', monat: '2026-06' }, 'Art'],
    [{ art: 'sonstiges', monat: '2026-06' }, 'Bezeichnung'],
    [{ art: 'praemie', monat: '2026-13' }, 'Monat'],
    [{ art: 'praemie', monat: '' }, 'Monat'],
    [{ art: 'praemie', monat: '2026-06', betrag: 'abc' }, 'Betrag'],
    [{ art: 'praemie', monat: '2026-06', betrag: '0' }, 'Betrag'],
    [{ art: 'praemie', monat: '2026-06', betrag: '-5' }, 'Betrag'],
  ])('Sonderzahlung lehnt %j ab', (e, wort) => {
    const r = pruefeSonderzahlung(e)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toContain(wort)
  })
  it('Urlaubsanspruch: halbe Tage erlaubt, sonst Fehler; Verlauf nach Datum', () => {
    expect(pruefeUrlaubsanspruch({ tage_pro_jahr: '27,5', gueltig_ab: '2026-01-01' })).toMatchObject({ ok: true, tage_pro_jahr: 27.5 })
    for (const t of ['0', '91', '20,3', 'abc', '']) expect(pruefeUrlaubsanspruch({ tage_pro_jahr: t, gueltig_ab: '2026-01-01' }).ok).toBe(false)
    expect(pruefeUrlaubsanspruch({ tage_pro_jahr: '30', gueltig_ab: '' }).ok).toBe(false)
    const h = [{ tage_pro_jahr: 26, gueltig_ab: '2025-01-01' }, { tage_pro_jahr: '28.0', gueltig_ab: '2026-07-01' }]
    expect(urlaubsanspruchAm(h, '2024-12-31')).toBeNull()
    expect(urlaubsanspruchAm(h, '2026-06-30')).toBe(26)
    expect(urlaubsanspruchAm(h, '2026-07-01')).toBe(28)
  })
  it('Konditionen: Datumsprüfung und Kürzen', () => {
    expect(pruefeKonditionen({ eintrittsdatum: '2026-02-30' }).ok).toBe(false)
    expect(pruefeKonditionen({ probezeit_ende: 'bald' }).ok).toBe(false)
    expect(pruefeKonditionen({ kuendigungsfrist: ' 4 Wochen ', eintrittsdatum: '2026-01-05' })).toMatchObject({ ok: true, kuendigungsfrist: '4 Wochen', probezeit_ende: null })
  })
})
