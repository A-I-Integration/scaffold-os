import { describe, it, expect } from 'vitest'
import { leereGbu, leereGbuZeile, gbuFehlt, offenePunkte } from '../gefaehrdungsbeurteilung'

const zeile = (w: 'ja' | 'nein' | 'offen' = 'ja') => ({ ...leereGbuZeile(), taetigkeit: 'a', gefaehrdung: 'b', massnahme: 'c', wirksam: w })

describe('gefaehrdungsbeurteilung', () => {
  it('leer meldet Pflichtangaben', () => {
    const f = gbuFehlt(leereGbu('2026-10-27'))
    expect(f).toContain('Ersteller'); expect(f).toContain('Unterschrift'); expect(f.some(x => x.startsWith('Zeile 1: Tätigkeit'))).toBe(true)
  })
  it('vollständig', () => expect(gbuFehlt({ ...leereGbu('2026-10-27'), ersteller: 'X', zeilen: [zeile()], unterschrift: 'd' })).toEqual([]))
  it('ohne Zeilen', () => expect(gbuFehlt({ ...leereGbu('2026-10-27'), ersteller: 'X', zeilen: [], unterschrift: 'd' })).toEqual(['mindestens eine Zeile']))
  it('Verantwortlicher optional', () => expect(gbuFehlt({ ...leereGbu('2026-10-27'), ersteller: 'X', zeilen: [{ ...zeile(), verantwortlich: '' }], unterschrift: 'd' })).toEqual([]))
  it('offene Punkte zählen nein und offen', () => expect(offenePunkte({ ...leereGbu('x'), zeilen: [zeile('ja'), zeile('nein'), zeile('offen')] })).toBe(2))
})
