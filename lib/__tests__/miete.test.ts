import { describe, it, expect } from 'vitest'
import { wirksamesMietende, tageBis, plusTageIso, faelligeErinnerung, verlaengertesEnde } from '../miete'

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
