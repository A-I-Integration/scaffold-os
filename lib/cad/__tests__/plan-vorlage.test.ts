import { describe, expect, it } from 'vitest'
import { korrekturFaktor, massstabNenner, meterJePunkt } from '../plan-vorlage'

describe('Plan-Vorlage: Maßstab', () => {
  it('A0 (3370 pt breit) bei 1:100 ist rund 118,9 m breit', () => {
    expect(3370.4 * meterJePunkt(100)).toBeCloseTo(118.9, 1)
  })
  it('1 pt bei 1:1 ist 1/72 Zoll', () => {
    expect(meterJePunkt(1)).toBeCloseTo(0.0254 / 72, 10)
  })
  it('ungültiger Nenner gibt 0', () => {
    expect(meterJePunkt(0)).toBe(0)
    expect(meterJePunkt(NaN)).toBe(0)
  })
  it('liest 1:100, 100, 1 : 50', () => {
    expect(massstabNenner('1:100')).toBe(100)
    expect(massstabNenner('100')).toBe(100)
    expect(massstabNenner(' 1 : 50 ')).toBe(50)
    expect(massstabNenner('abc')).toBeNull()
    expect(massstabNenner('0')).toBeNull()
  })
  it('Korrekturfaktor aus Prüfstrecke', () => {
    expect(korrekturFaktor(13.5, 13.79)).toBeCloseTo(1.0215, 3)
    expect(korrekturFaktor(0, 5)).toBeNull()
    expect(korrekturFaktor(1, 50)).toBeNull()
  })
})
