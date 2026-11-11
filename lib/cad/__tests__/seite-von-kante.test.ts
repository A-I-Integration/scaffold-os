import { describe, expect, it } from 'vitest'
import { seiteVonKante } from '../plan-oeffnungen-modell'

describe('seiteVonKante', () => {
  it('Vorderseite unten: unten = vorne, oben = hinten, links = links, rechts = rechts', () => {
    expect(seiteVonKante('unten', 'unten')).toBe('front'); expect(seiteVonKante('oben', 'unten')).toBe('back')
    expect(seiteVonKante('links', 'unten')).toBe('left'); expect(seiteVonKante('rechts', 'unten')).toBe('right')
  })
  it('Vorderseite oben: Blick von außen von Norden, links und rechts vertauscht', () => {
    expect(seiteVonKante('oben', 'oben')).toBe('front'); expect(seiteVonKante('unten', 'oben')).toBe('back')
    expect(seiteVonKante('links', 'oben')).toBe('right'); expect(seiteVonKante('rechts', 'oben')).toBe('left')
  })
  it('Vorderseite links: Blick von Westen, Norden (oben) liegt links', () => {
    expect(seiteVonKante('links', 'links')).toBe('front'); expect(seiteVonKante('rechts', 'links')).toBe('back')
    expect(seiteVonKante('oben', 'links')).toBe('left'); expect(seiteVonKante('unten', 'links')).toBe('right')
  })
})
