import { describe, it, expect } from 'vitest'
import { wirksamesMietende, tageBis, plusTageIso, faelligeErinnerung, verlaengertesEnde, verlaengertesEndeBis } from '../miete'

describe('wirksamesMietende', () => {
  it('nimmt das spätere Datum', () => {
    expect(wirksamesMietende('2026-10-10', '2026-10-20')).toBe('2026-10-20')
    expect(wirksamesMietende('2026-10-20', '2026-10-10')).toBe('2026-10-20')
  })
  it('ignoriert ungültige Werte', () => {
    expect(wirksamesMietende(undefined, '2026-10-20')).toBe('2026-10-20')
    expect(wirksamesMietende('kaputt', null)).toBeNull()
    expect(wirksamesMietende('2026-10-10', 'x')).toBe('2026-10-10')
  })
})

describe('tageBis / plusTageIso', () => {
  it('zählt Kalendertage (auch über Monats- und Zeitumstellungsgrenzen)', () => {
    expect(tageBis('2026-10-15', '2026-10-01')).toBe(14)
    expect(tageBis('2026-10-01', '2026-10-01')).toBe(0)
    expect(tageBis('2026-09-30', '2026-10-01')).toBe(-1)
    expect(tageBis('2026-11-02', '2026-10-24')).toBe(9) // Zeitumstellung 25.10.
    expect(plusTageIso('2026-10-28', 7)).toBe('2026-11-04')
    expect(plusTageIso('2026-12-28', 7)).toBe('2027-01-04')
  })
})

describe('faelligeErinnerung', () => {
  const heute = '2026-10-01'
  it('14 Tage vorher, 7 Tage vorher, sonst nichts', () => {
    expect(faelligeErinnerung('2026-10-15', heute, undefined)).toBe(14)
    expect(faelligeErinnerung('2026-10-12', heute, undefined)).toBe(14)
    expect(faelligeErinnerung('2026-10-08', heute, undefined)).toBe(7)
    expect(faelligeErinnerung('2026-10-16', heute, undefined)).toBeNull()
    expect(faelligeErinnerung('2026-10-01', heute, undefined)).toBe(7)
  })
  it('nicht doppelt senden', () => {
    expect(faelligeErinnerung('2026-10-12', heute, { t14: '2026-09-30' })).toBeNull()
    expect(faelligeErinnerung('2026-10-05', heute, { t7: '2026-10-01' })).toBeNull()
    expect(faelligeErinnerung('2026-10-05', heute, { t14: '2026-09-25' })).toBe(7)
  })
  it('überschrittenes Ende: keine Erinnerung', () => {
    expect(faelligeErinnerung('2026-09-30', heute, undefined)).toBeNull()
  })
})

describe('verlaengertesEnde', () => {
  it('verlängert ab wirksamem Ende um ganze Wochen', () => {
    expect(verlaengertesEnde('2026-10-10', '2026-10-01', 1)).toBe('2026-10-17')
    expect(verlaengertesEnde('2026-10-10', '2026-10-01', 4)).toBe('2026-11-07')
  })
  it('bei bereits überschrittenem Ende ab heute', () => {
    expect(verlaengertesEnde('2026-09-20', '2026-10-01', 1)).toBe('2026-10-08')
  })
  it('begrenzt Wochen auf 1..52', () => {
    expect(verlaengertesEnde('2026-10-10', '2026-10-01', 0)).toBe('2026-10-17')
    expect(verlaengertesEnde('2026-10-10', '2026-10-01', 999)).toBe(plusTageIso('2026-10-10', 7 * 52))
  })
})

describe('verlaengertesEndeBis', () => {
  it('nimmt ein Datum nach dem wirksamen Ende', () => {
    expect(verlaengertesEndeBis('2026-10-10', '2026-10-31')).toBe('2026-10-31')
  })
  it('lehnt Datum am oder vor dem Ende, ungültige Werte und über 52 Wochen ab', () => {
    expect(verlaengertesEndeBis('2026-10-10', '2026-10-10')).toBeNull()
    expect(verlaengertesEndeBis('2026-10-10', '2026-10-01')).toBeNull()
    expect(verlaengertesEndeBis('2026-10-10', 'morgen')).toBeNull()
    expect(verlaengertesEndeBis('2026-10-10', undefined)).toBeNull()
    expect(verlaengertesEndeBis('2026-10-10', '2028-01-01')).toBeNull()
  })
})

import { standzeitNachberechnung } from '../miete'
describe('standzeitNachberechnung', () => {
  it('9 Tage überzogen: 2 Wochen, Merker = Ende der 2 Wochen', () => {
    const r = standzeitNachberechnung('2026-10-01', undefined, undefined, '2026-10-10')
    expect(r).toMatchObject({ abgerechnetBis: '2026-10-01', tageUeber: 9, wochen: 2, neuAbgerechnetBis: '2026-10-15' })
  })
  it('am Folgetag keine zweite Rechnung (der Fehler vorher: Merker = heute)', () => {
    const erste = standzeitNachberechnung('2026-10-01', undefined, undefined, '2026-10-10')!
    for (const tag of ['2026-10-11', '2026-10-12', '2026-10-15']) {
      expect(standzeitNachberechnung('2026-10-01', undefined, erste.neuAbgerechnetBis, tag)).toBeNull()
    }
  })
  it('nach Ablauf der bezahlten Wochen: nächste Woche wird fällig', () => {
    const r = standzeitNachberechnung('2026-10-01', undefined, '2026-10-15', '2026-10-16')
    expect(r).toMatchObject({ abgerechnetBis: '2026-10-15', tageUeber: 1, wochen: 1, neuAbgerechnetBis: '2026-10-22' })
  })
  it('nicht überzogen oder ohne Ende: null', () => {
    expect(standzeitNachberechnung('2026-10-10', undefined, undefined, '2026-10-10')).toBeNull()
    expect(standzeitNachberechnung(undefined, undefined, undefined, '2026-10-10')).toBeNull()
  })
  it('kostenlos verlängertes Ende zählt als Mietende', () => {
    expect(standzeitNachberechnung('2026-10-01', '2026-10-20', undefined, '2026-10-15')).toBeNull()
    expect(standzeitNachberechnung('2026-10-01', '2026-10-20', undefined, '2026-10-21')).toMatchObject({ abgerechnetBis: '2026-10-20', wochen: 1 })
  })
})

import { wochenZwischen } from '../miete'
describe('wochenZwischen', () => {
  it('volle und angefangene Wochen', () => {
    expect(wochenZwischen('2026-03-02', '2026-03-09')).toBe(1)
    expect(wochenZwischen('2026-03-02', '2026-03-10')).toBe(2)
    expect(wochenZwischen('2026-03-02', '2026-05-25')).toBe(12)
  })
  it('ungültig oder rückwärts: null', () => {
    expect(wochenZwischen('2026-03-02', '2026-03-02')).toBeNull()
    expect(wochenZwischen('2026-03-09', '2026-03-02')).toBeNull()
    expect(wochenZwischen('', '2026-03-02')).toBeNull()
    expect(wochenZwischen(undefined, undefined)).toBeNull()
  })
})
