import { describe, it, expect } from 'vitest'
import { PRUEFPUNKTE, leerePruefung, fehlendeAngaben, auswertung, kennzeichnungMoeglich, lastklasseText, breitenklasseText, bauartText, gruppiert } from '../geruestpruefung'
import { generateGeruestpruefungPDF } from '../geruestpruefung-pdf'

const alle = (a: 'ja' | 'nein' | 'nz') => Object.fromEntries(PRUEFPUNKTE.map(x => [x.key, a]))
const voll = () => ({ ...leerePruefung('2026-11-04'), bauart: ['Fassadengerüst'], lastklasse: '3', breitenklasse: 'W09', pruefer: 'A. B.', unterschrift: 'data:x', antworten: alle('ja') as never })

describe('geruestpruefung', () => {
  it('Schlüssel eindeutig, Gruppen zusammenhängend', () => {
    expect(new Set(PRUEFPUNKTE.map(x => x.key)).size).toBe(PRUEFPUNKTE.length)
    expect(gruppiert().map(g => g.gruppe).length).toBe(new Set(gruppiert().map(g => g.gruppe)).size)
  })
  it('leer meldet Pflichtangaben', () => {
    const f = fehlendeAngaben(leerePruefung('2026-11-04'))
    expect(f).toEqual(expect.arrayContaining(['Gerüstart', 'Lastklasse', 'Breitenklasse', 'Name der befähigten Person', 'Unterschrift der befähigten Person']))
    expect(f.some(x => x.startsWith('Prüfpunkte noch nicht beantwortet (' + PRUEFPUNKTE.length))).toBe(true)
  })
  it('vollständig', () => expect(fehlendeAngaben(voll())).toEqual([]))
  it('Kennzeichnung nur ohne „nein“ und ohne offene Punkte', () => {
    expect(kennzeichnungMoeglich(voll())).toBe(true)
    expect(kennzeichnungMoeglich({ ...voll(), antworten: { ...alle('ja'), seitenschutz: 'nein' } as never })).toBe(false)
    expect(kennzeichnungMoeglich({ ...voll(), antworten: {} })).toBe(false)
    expect(auswertung({ antworten: { ...alle('nz') } as never }).anzahlOffen).toBe(0)
  })
  it('Texte', () => {
    expect(lastklasseText(voll())).toBe('Lastklasse 3 (2,0 kN/m²)')
    expect(lastklasseText({ lastklasse: 'eigene', lastEigen: '5' })).toBe('5 kN/m²')
    expect(breitenklasseText({ breitenklasse: 'eigene', breiteEigen: 'W12' })).toBe('W12')
    expect(bauartText({ bauart: ['Raumgerüst'], sonderGeruest: 'Podest' })).toBe('Raumgerüst, Podest')
  })
  it('PDF wird erzeugt', () => {
    const d = generateGeruestpruefungPDF({ ...voll(), antworten: { ...alle('ja'), wandabstand: 'nein' } as never }, { name: 'Test', adresse: 'Str. 1' }, { company_name: 'Firma' })
    expect(d.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    expect(String(d.output('arraybuffer').byteLength)).not.toBe('0')
  })
})
