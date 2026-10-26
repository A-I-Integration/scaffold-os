import { describe, it, expect } from 'vitest'
import { leereZeile, leeresProtokoll, fehlendeAngaben, auswertung, zahl, zeileFehlt } from '../verankerungsprotokoll'

const ok = () => ({ zone: 'Nord', ankerart: 'Typ A', anzahl: '3', pruefkraft_kn: '6,0', ergebnis: 'bestanden' as const, bemerkung: '' })

describe('verankerungsprotokoll', () => {
  it('zahl akzeptiert Komma', () => { expect(zahl('6,5')).toBe(6.5); expect(zahl('abc')).toBeNull(); expect(zahl('')).toBeNull() })
  it('leere Zeile meldet alles', () => expect(zeileFehlt(leereZeile())).toEqual(['Prüfzone', 'Ankerart', 'Anzahl', 'Prüfkraft', 'Ergebnis']))
  it('Anzahl muss ganze Zahl ≥ 1 sein', () => { expect(zeileFehlt({ ...ok(), anzahl: '0' })).toEqual(['Anzahl']); expect(zeileFehlt({ ...ok(), anzahl: '2,5' })).toEqual(['Anzahl']) })
  it('Prüfkraft muss > 0 sein', () => expect(zeileFehlt({ ...ok(), pruefkraft_kn: '0' })).toEqual(['Prüfkraft']))
  it('vollständig', () => expect(fehlendeAngaben({ ...leeresProtokoll('2026-10-26'), pruefer: 'A. B.', zeilen: [ok()], unterschrift: 'data:x' })).toEqual([]))
  it('fehlende Angaben', () => {
    const f = fehlendeAngaben(leeresProtokoll('2026-10-26'))
    expect(f).toContain('Prüfende Person'); expect(f).toContain('Unterschrift'); expect(f.some(x => x.startsWith('Zeile 1'))).toBe(true)
  })
  it('auswertung summiert', () => {
    const v = { ...leeresProtokoll('2026-10-26'), zeilen: [ok(), { ...ok(), anzahl: '2', ergebnis: 'nicht_bestanden' as const }] }
    expect(auswertung(v)).toEqual({ geprueft: 5, zonen: 2, nichtBestanden: 1, alleBestanden: false })
  })
  it('alle bestanden', () => expect(auswertung({ ...leeresProtokoll('x'), zeilen: [ok()] }).alleBestanden).toBe(true))
  it('leere Liste ist nicht bestanden', () => expect(auswertung({ ...leeresProtokoll('x'), zeilen: [] }).alleBestanden).toBe(false))
})
