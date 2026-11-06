import { describe, it, expect } from 'vitest'
import { eingabeStandGeruest, istGeruestVeraltet } from '@/lib/cad/modell-veraltet'

const haus = { lengthM: 12, widthM: 9, heightM: 9.2, tueren: [{ id: 't1', side: 'right', widthM: 3.57, heightM: 3.27 }] }

describe('Gerüst veraltet?', () => {
  it('gleiche Eingaben (auch in anderer Schlüsselreihenfolge) → nicht veraltet', () => {
    const a = eingabeStandGeruest(haus, 'layher-allround')
    const b = eingabeStandGeruest({ heightM: 9.2, tueren: [{ heightM: 3.27, widthM: 3.57, side: 'right', id: 't1' }], widthM: 9, lengthM: 12 }, 'layher-allround')
    expect(istGeruestVeraltet(true, a, b)).toBe(false)
  })
  it('Tür geändert (Breite 3,57 → 1,20) → veraltet', () => {
    const alt = eingabeStandGeruest(haus, 'layher-allround')
    const neu = eingabeStandGeruest({ ...haus, tueren: [{ ...haus.tueren[0], widthM: 1.2, heightM: 2.1 }] }, 'layher-allround')
    expect(istGeruestVeraltet(true, alt, neu)).toBe(true)
  })
  it('Tür hinzugefügt oder entfernt, System gewechselt → veraltet', () => {
    const alt = eingabeStandGeruest(haus, 'layher-allround')
    expect(istGeruestVeraltet(true, alt, eingabeStandGeruest({ ...haus, tueren: [] }, 'layher-allround'))).toBe(true)
    expect(istGeruestVeraltet(true, alt, eingabeStandGeruest(haus, 'rux-super65'))).toBe(true)
  })
  it('kein Modell oder kein gemerkter Stand → nie veraltet (kein falscher Alarm)', () => {
    const s = eingabeStandGeruest(haus, 'layher-allround')
    expect(istGeruestVeraltet(false, s, 'x')).toBe(false)
    expect(istGeruestVeraltet(true, null, s)).toBe(false)
  })
})
