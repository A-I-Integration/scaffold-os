import { describe, it, expect } from 'vitest'
import { pruefePersonalEingabe, istGueltigeIban, istIsoDatum } from '../personalstamm'

describe('Personalstamm-Prüfung', () => {
  it('nimmt eine vollständige gültige Eingabe an und bereinigt sie', () => {
    const r = pruefePersonalEingabe({ geburtsdatum: '1990-01-01', plz: '48683', sv_nummer: '12 010190 a 123', steuer_id: '12 345 678 901', steuerklasse: '3', kinderfreibetraege: '1,5', konfession: 'rk', iban: 'de89 3704 0044 0532 0130 00', bic: 'cobadeff', beschaeftigungsart: 'vollzeit', strasse: '  Hauptstr. 1 ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.daten).toMatchObject({ sv_nummer: '12010190A123', steuer_id: '12345678901', steuerklasse: 3, kinderfreibetraege: 1.5, iban: 'DE89370400440532013000', bic: 'COBADEFF', strasse: 'Hauptstr. 1', geburtsname: null })
  })
  it('lässt leere Felder zu (alles optional)', () => {
    const r = pruefePersonalEingabe({})
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.values(r.daten).every(v => v === null)).toBe(true)
  })
  it.each([
    [{ sv_nummer: '1234' }, 'Sozialversicherungsnummer'],
    [{ steuer_id: '01234567890' }, 'Steuer-ID'],
    [{ steuer_id: '123' }, 'Steuer-ID'],
    [{ steuerklasse: '7' }, 'Steuerklasse'],
    [{ kinderfreibetraege: '0,3' }, 'Kinderfreibeträge'],
    [{ plz: '1234' }, 'Postleitzahl'],
    [{ iban: 'DE89370400440532013001' }, 'IBAN'],
    [{ bic: 'XY' }, 'BIC'],
    [{ konfession: 'xyz' }, 'Konfession'],
    [{ geburtsdatum: '31.02.1990' }, 'Geburtsdatum'],
    [{ geburtsdatum: '2999-01-01' }, 'Zukunft'],
    [{ eintrittsdatum: '2026-05-01', austrittsdatum: '2026-04-01' }, 'Austrittsdatum'],
  ])('lehnt %j ab', (eingabe, wort) => {
    const r = pruefePersonalEingabe(eingabe as never)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toContain(wort)
  })
  it('IBAN-Prüfsumme und Datum', () => {
    expect(istGueltigeIban('DE89 3704 0044 0532 0130 00')).toBe(true)
    expect(istGueltigeIban('DE89 3704 0044 0532 0130 01')).toBe(false)
    expect(istIsoDatum('2026-02-29')).toBe(false)
    expect(istIsoDatum('2028-02-29')).toBe(true)
  })
})
