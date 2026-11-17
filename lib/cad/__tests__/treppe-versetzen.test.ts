import { describe, it, expect } from 'vitest'
import { feldDerAutoTreppe, nachbarFuerTreppe } from '../treppe-setzen'
import type { ScaffoldField } from '@/lib/calculations/cad-engine'

const f = (index: number, x: number, lage = 0): ScaffoldField =>
  ({ id: `front-${lage}-${index}`, side: 'front', index, levelIndex: lage, positionX: x, positionZ: 0, lengthM: 2.5 }) as unknown as ScaffoldField
const modell = { fields: [f(0, 0), f(1, 2.5), f(2, 5), f(0, 0, 1), f(1, 2.5, 1)] }

describe('Treppe versetzen', () => {
  it('findet das Feld an der untersten Lage', () => {
    expect(feldDerAutoTreppe(modell as never, [2.5, 0, 0])?.id).toBe('front-0-1')
  })
  it('rechts/links wählt das Nachbarfeld, am Ende Meldung', () => {
    expect(nachbarFuerTreppe(modell as never, modell.fields[1], 1).feld?.id).toBe('front-0-2')
    expect(nachbarFuerTreppe(modell as never, modell.fields[1], -1).feld?.id).toBe('front-0-0')
    const e = nachbarFuerTreppe(modell as never, modell.fields[2], 1)
    expect(e.feld).toBeNull(); expect(e.grund).toBeTruthy()
  })
})
