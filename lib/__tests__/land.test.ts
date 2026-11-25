import { describe, it, expect } from 'vitest'
import { pruefeLand, kundenAnschrift, adresseMitLand, steuerVorschlagFuerBaustelle, istInland, istLuxemburg, landOderStandard, LAENDER_VORSCHLAG } from '@/lib/land'

describe('Land', () => {
  it('Vorschlagsliste enthält die gewünschten Länder', () => {
    for (const l of ['Deutschland', 'Luxemburg', 'Österreich', 'Schweiz', 'Polen', 'Bulgarien', 'Niederlande']) expect(LAENDER_VORSCHLAG).toContain(l)
  })
  it('pruefeLand: leer = nicht gesetzt, zu lang/Sonderzeichen abgelehnt', () => {
    expect(pruefeLand('')).toEqual({ ok: true, land: null })
    expect(pruefeLand(undefined)).toEqual({ ok: true, land: null })
    expect(pruefeLand('  Luxemburg ')).toEqual({ ok: true, land: 'Luxemburg' })
    expect(pruefeLand('x'.repeat(61)).ok).toBe(false)
    expect(pruefeLand('<b>').ok).toBe(false)
  })
  it('leer gilt als Deutschland', () => {
    expect(landOderStandard('')).toBe('Deutschland')
    expect(istInland(null)).toBe(true)
    expect(istInland('Luxemburg')).toBe(false)
    expect(istLuxemburg('Luxembourg')).toBe(true)
  })
  it('kundenAnschrift: Land nur im Ausland', () => {
    expect(kundenAnschrift({ street: 'Hauptstr. 1', zip: '12345', city: 'Berlin' })).toBe('Hauptstr. 1, 12345 Berlin')
    expect(kundenAnschrift({ street: 'Hauptstr. 1', zip: '12345', city: 'Berlin', land: 'Deutschland' })).toBe('Hauptstr. 1, 12345 Berlin')
    expect(kundenAnschrift({ street: 'Rue 2', zip: 'L-1111', city: 'Luxembourg', land: 'Luxemburg' })).toBe('Rue 2, L-1111 Luxembourg, Luxemburg')
    expect(kundenAnschrift(null)).toBe('')
  })
  it('adresseMitLand hängt das Land nur einmal und nur im Ausland an', () => {
    expect(adresseMitLand('Rue 2, L-1111 Luxembourg', 'Luxemburg')).toBe('Rue 2, L-1111 Luxembourg, Luxemburg')
    expect(adresseMitLand('Rue 2, Luxemburg', 'Luxemburg')).toBe('Rue 2, Luxemburg')
    expect(adresseMitLand('Weg 1, Berlin', 'Deutschland')).toBe('Weg 1, Berlin')
    expect(adresseMitLand('', 'Polen')).toBe('Polen')
  })
  it('Steuervorschlag nur für Luxemburg', () => {
    expect(steuerVorschlagFuerBaustelle('Luxemburg')).toMatchObject({ taxRate: 17, steuerfall: 'lu_tva' })
    expect(steuerVorschlagFuerBaustelle('Österreich')).toBeNull()
    expect(steuerVorschlagFuerBaustelle('')).toBeNull()
  })
})
