import { describe, it, expect } from 'vitest'
import { standardpreiseAus, standardpreisFuer, firmenwerteAus, lvStilFuerGebaeude, FIRMENFELDER } from '@/lib/lv-firmenwerte'

describe('LV-Firmenwerte und Standardpreise', () => {
  it('bereinigt Rohdaten: nur bekannte Positionen, nur Zahlen > 0', () => {
    const r = standardpreiseAus({ 'Bauzaun': { ep: '12,5', epJeWoche: 0 }, Unbekannt: { ep: 5 }, 'Bauzauntor': { ep: -1 }, 'Haltestellenausstattung 1. BA': { epJeWoche: 3 } })
    expect(r).toEqual({ Bauzaun: { ep: 12.5 }, 'Haltestellenausstattung 1. BA': { epJeWoche: 3 } })
    expect(standardpreiseAus(null)).toEqual({})
    expect(standardpreiseAus([1, 2])).toEqual({})
  })
  it('übernimmt den Faktor je Position', () => {
    expect(standardpreiseAus({ Bauzaun: { faktorProzent: '80' }, Bauzauntor: { faktorProzent: 0 } })).toEqual({ Bauzaun: { faktorProzent: 80 } })
  })
  it('findet den Preis über den Titelanfang, längster Schlüssel gewinnt', () => {
    const p = { Bauzaun: { ep: 1 }, Bauzauntor: { ep: 2 } }
    expect(standardpreisFuer(p, 'Bauzauntor')?.ep).toBe(2)
    expect(standardpreisFuer(p, 'Bauzaun')?.ep).toBe(1)
    expect(standardpreisFuer(p, 'Personen- und Lastenaufzug 500/800kg 1.BA H = ca. 32m')).toBeUndefined()
    expect(standardpreisFuer(undefined, 'x')).toBeUndefined()
  })
  it('übernimmt nur bekannte Firmenfelder', () => {
    expect(firmenwerteAus({ stundensatzFach: 55, bosheit: 'x', stil: 'statiker' })).toEqual({ stundensatzFach: 55 })   // der Stil wird nicht aus gespeicherten Firmenwerten übernommen
    expect(firmenwerteAus('text')).toEqual({})
  })
})

describe('LV-Stil richtet sich nach dem Gebäude, nicht nach einem gemerkten Wert', () => {
  it('der Stil gehört nicht zu den gespeicherten Firmenwerten', () => {
    expect((FIRMENFELDER as readonly string[]).includes('stil')).toBe(false)
  })
  it('Haus ohne Turm → getrennt; Kirche mit Turm über 21,5 m → statiker; niedriger Turm → getrennt', () => {
    expect(lvStilFuerGebaeude({ heightM: 9.4 })).toBe('getrennt')
    expect(lvStilFuerGebaeude({ heightM: 45, sections: [{ bezeichnung: 'Turm', helmGeruest: true }, { bezeichnung: 'Kirchenschiff' }] })).toBe('statiker')
    expect(lvStilFuerGebaeude({ heightM: 18, sections: [{ bezeichnung: 'Turm' }] })).toBe('getrennt')
    expect(lvStilFuerGebaeude({ heightM: 30 })).toBe('getrennt')
  })
})
