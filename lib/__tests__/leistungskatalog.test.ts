import { describe, it, expect } from 'vitest'
import { parsePreis, katalogAusTabelle, istDoppelt, katalogAlsPosition, KATALOG_VORLAGE, normalisiereKatalog } from '@/lib/leistungskatalog'

describe('parsePreis', () => {
  it('deutsche und englische Schreibweise, Euro, leer', () => {
    expect(parsePreis('8,50')).toBe(8.5); expect(parsePreis('1.234,50 €')).toBe(1234.5); expect(parsePreis('8.5')).toBe(8.5); expect(parsePreis(12)).toBe(12)
    expect(parsePreis('')).toBeNull(); expect(parsePreis('nach Aufwand')).toBeNull(); expect(parsePreis('auf Anfrage')).toBeNull(); expect(parsePreis('-3')).toBeNull()
  })
})
describe('katalogAusTabelle', () => {
  it('erkennt Spalten mit anderen Namen, übernimmt Kategorie nach unten, überspringt leere Zeilen', () => {
    const r = katalogAusTabelle([['Titel', 'Leistungsbezeichnung', 'EH', 'EP'], ['Fassade', 'Aufbau', 'm²', '8,50'], ['', 'Abbau', 'm²', '4,20'], ['', '', '', ''], ['Zusatz', 'Treppenturm', 'Stück', 'auf Anfrage']])
    expect(r.eintraege).toHaveLength(3)
    expect(r.eintraege[0]).toMatchObject({ kategorie: 'Fassade', bezeichnung: 'Aufbau', einheit: 'm²', preis: 8.5 })
    expect(r.eintraege[1].kategorie).toBe('Fassade')
    expect(r.eintraege[2]).toMatchObject({ kategorie: 'Zusatz', preis: null })
    expect(r.hinweise.join(' ')).toContain('ohne Preis')
  })
  it('ohne Bezeichnungsspalte: keine Einträge und klare Meldung', () => {
    const r = katalogAusTabelle([['A', 'B'], ['x', 'y']])
    expect(r.eintraege).toEqual([]); expect(r.hinweise[0]).toContain('Leistung')
  })
})
describe('Rest', () => {
  it('Vorlage ohne erfundene Preise, Dubletten, Position', () => {
    expect(KATALOG_VORLAGE.every((e) => e.preis === null)).toBe(true)
    expect(istDoppelt({ bezeichnung: ' Gerüst  abbauen', einheit: 'M²' }, KATALOG_VORLAGE)).toBe(true)
    expect(katalogAlsPosition({ kategorie: '', bezeichnung: 'X', einheit: 'm²', preis: null }, 3)).toEqual({ bezeichnung: 'X', menge: 3, einheit: 'm²', einzelpreis: 0 })
    expect(normalisiereKatalog([{ bezeichnung: 'A', preis: '2.5' }, { bezeichnung: '' }])).toHaveLength(1)
  })
})
