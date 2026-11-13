import { describe, it, expect } from 'vitest'
import { seiteVonHimmelsrichtung } from '../plan-oeffnungen-modell'

describe('seiteVonHimmelsrichtung (Plan oben = Norden)', () => {
  it('Vorderseite = Plan-Unterkante (Süden): Ost rechts, West links, Nord hinten', () => {
    expect(seiteVonHimmelsrichtung('sued', 'unten')).toBe('front')
    expect(seiteVonHimmelsrichtung('nord', 'unten')).toBe('back')
    expect(seiteVonHimmelsrichtung('ost', 'unten')).toBe('right')
    expect(seiteVonHimmelsrichtung('west', 'unten')).toBe('left')
  })
  it('Vorderseite = linke Plan-Kante (Westen): Nord erscheint links, Süd rechts', () => {
    expect(seiteVonHimmelsrichtung('west', 'links')).toBe('front')
    expect(seiteVonHimmelsrichtung('ost', 'links')).toBe('back')
    expect(seiteVonHimmelsrichtung('nord', 'links')).toBe('left')
    expect(seiteVonHimmelsrichtung('sued', 'links')).toBe('right')
  })
})
