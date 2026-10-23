import { describe, it, expect } from 'vitest'
import { ansichtDateiname } from '../ansicht-bild'
describe('ansichtDateiname', () => {
  it('Modus und Datum im Namen', () => {
    expect(ansichtDateiname('praesentation', new Date(2026, 9, 3))).toBe('CAD-Ansicht-Praesentation-2026-10-03.png')
    expect(ansichtDateiname('real', new Date(2026, 0, 15))).toBe('CAD-Ansicht-Real-2026-01-15.png')
    expect(ansichtDateiname('bauteil', new Date(2026, 11, 31))).toBe('CAD-Ansicht-Nach-Bauteil-2026-12-31.png')
  })
})
