import { describe, it, expect } from 'vitest'
import { pruefeLohnEingabe, stundenlohnAm, lohnVerlauf } from '../stundenlohn'

describe('Stundenlohn mit Gültigkeitsdatum', () => {
  it('liest Komma und Punkt, rundet auf Cent', () => {
    expect(pruefeLohnEingabe({ stundenlohn: '18,5', gueltig_ab: '2026-11-01' })).toMatchObject({ ok: true, stundenlohn: 18.5 })
    expect(pruefeLohnEingabe({ stundenlohn: '17.09', gueltig_ab: '2026-11-01' })).toMatchObject({ ok: true, stundenlohn: 17.09 })
    expect(pruefeLohnEingabe({ stundenlohn: 20.105, gueltig_ab: '2026-11-01' })).toMatchObject({ ok: true })
  })
  it('lehnt unlesbare, zu kleine, zu große Werte und fehlendes Datum ab', () => {
    expect(pruefeLohnEingabe({ stundenlohn: 'abc', gueltig_ab: '2026-11-01' }).ok).toBe(false)
    expect(pruefeLohnEingabe({ stundenlohn: '', gueltig_ab: '2026-11-01' }).ok).toBe(false)
    expect(pruefeLohnEingabe({ stundenlohn: '0', gueltig_ab: '2026-11-01' }).ok).toBe(false)
    expect(pruefeLohnEingabe({ stundenlohn: '-5', gueltig_ab: '2026-11-01' }).ok).toBe(false)
    expect(pruefeLohnEingabe({ stundenlohn: '900', gueltig_ab: '2026-11-01' }).ok).toBe(false)
    expect(pruefeLohnEingabe({ stundenlohn: '18', gueltig_ab: '' }).ok).toBe(false)
    expect(pruefeLohnEingabe({ stundenlohn: '18', gueltig_ab: '2026-13-40' }).ok).toBe(false)
  })
  it('Notiz wird gekürzt und leer zu null', () => {
    expect(pruefeLohnEingabe({ stundenlohn: '18', gueltig_ab: '2026-11-01', notiz: '  ' })).toMatchObject({ notiz: null })
    const r = pruefeLohnEingabe({ stundenlohn: '18', gueltig_ab: '2026-11-01', notiz: 'x'.repeat(400) })
    expect(r.ok && r.notiz!.length).toBe(300)
  })
  it('an einem Tag gilt der jüngste Eintrag, der nicht nach dem Tag beginnt', () => {
    const h = [{ stundenlohn: 17, gueltig_ab: '2026-01-01' }, { stundenlohn: 18.5, gueltig_ab: '2026-10-01' }, { stundenlohn: 20, gueltig_ab: '2027-01-01' }]
    expect(stundenlohnAm(h, '2025-12-31')).toBeNull()
    expect(stundenlohnAm(h, '2026-01-01')).toBe(17)
    expect(stundenlohnAm(h, '2026-09-30')).toBe(17)
    expect(stundenlohnAm(h, '2026-10-01')).toBe(18.5)
    expect(stundenlohnAm(h, '2026-12-31')).toBe(18.5)
    expect(stundenlohnAm(h, '2027-06-01')).toBe(20)
    expect(stundenlohnAm([], '2026-10-01')).toBeNull()
  })
  it('Verlauf neueste zuerst', () => {
    expect(lohnVerlauf([{ gueltig_ab: '2026-01-01' }, { gueltig_ab: '2027-01-01' }]).map((x) => x.gueltig_ab)).toEqual(['2027-01-01', '2026-01-01'])
  })
})
