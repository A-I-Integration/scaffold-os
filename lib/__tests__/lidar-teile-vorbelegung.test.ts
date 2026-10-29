import { describe, it, expect } from 'vitest'
import { teileVorbelegung } from '@/lib/lidar-teile-vorbelegung'

const haus = { typ: 'schiff', laengeM: 9.5, tiefeM: 12.9, traufhoeheM: 7.8, dachForm: 'walmdach', dachHoeheM: 1.6, versatzM: 0 }
const garage = { typ: 'anbau', laengeM: 6, tiefeM: 6.3, traufhoeheM: 3, dachForm: 'flachdach', dachHoeheM: 0, versatzM: 3 }

describe('teileVorbelegung', () => {
  it('Haus + Garage: Traufhöhe und Dachform vom Haupthaus, Garage erkannt', () => {
    const v = teileVorbelegung([garage, haus])!
    expect(v.traufhoehe).toBe('7.80')
    expect(v.dachform).toBe('Walmdach')
    expect(v.garagen).toBe(true)
    expect(v.hinweis).toContain('Nebengebäude')
    expect(v.laenge).toBe('12.90')
    expect(v.breite).toBe('9.50')
  })
  it('nur ein Teil → keine Garage', () => {
    expect(teileVorbelegung([haus])!.garagen).toBe(false)
  })
  it('keine / ungültige Teile → null', () => {
    expect(teileVorbelegung(undefined)).toBeNull()
    expect(teileVorbelegung([])).toBeNull()
    expect(teileVorbelegung([{ traufhoeheM: 0 }])).toBeNull()
  })
})

describe('Gesamthöhe aus dem Haupthaus', () => {
  it('Höhe = Traufhöhe + Dachhöhe des größten Teils (nicht die größte Fläche der ganzen Szene)', () => {
    const v = teileVorbelegung([
      { typ: 'schiff', laengeM: 14.5, tiefeM: 8.1, traufhoeheM: 6.6, dachForm: 'satteldach', dachHoeheM: 2.6 },
      { typ: 'schiff', laengeM: 6, tiefeM: 4, traufhoeheM: 3, dachForm: 'flachdach', dachHoeheM: 0 },
    ])
    expect(v?.hoehe).toBe('9.20')
  })
  it('ohne Dachhöhe = Traufhöhe', () => {
    expect(teileVorbelegung([{ laengeM: 10, tiefeM: 8, traufhoeheM: 7, dachForm: 'flachdach' }])?.hoehe).toBe('7.00')
  })
})
