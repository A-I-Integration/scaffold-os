import { describe, it, expect } from 'vitest'
import { lokalesDatumIso } from '../datum'

describe('lokalesDatumIso', () => {
  it('nimmt das lokale Datum, auch kurz nach Mitternacht', () => {
    expect(lokalesDatumIso(new Date(2026, 9, 7, 0, 30))).toBe('2026-10-07')
    expect(lokalesDatumIso(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07')
  })
  it('füllt Monat und Tag mit führender Null', () => {
    expect(lokalesDatumIso(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })
  it('Jahreswechsel', () => {
    expect(lokalesDatumIso(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31')
    expect(lokalesDatumIso(new Date(2027, 0, 1, 0, 5))).toBe('2027-01-01')
  })
})
