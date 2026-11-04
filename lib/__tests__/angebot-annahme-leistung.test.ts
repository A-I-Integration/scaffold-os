import { describe, it, expect } from 'vitest'
import { istLeistungsZeile } from '@/lib/angebot-annahme'

describe('istLeistungsZeile', () => {
  it('Sonderteil/Leistung wird nicht ans Lager gebucht, Material schon', () => {
    expect(istLeistungsZeile({ category: 'Sonderteil', articleNumber: 'SONDER' })).toBe(true)
    expect(istLeistungsZeile({ articleNumber: 'SONDER' })).toBe(true)
    expect(istLeistungsZeile({ category: 'Rahmen', articleNumber: '123' })).toBe(false)
  })
})
