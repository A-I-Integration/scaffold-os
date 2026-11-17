import { describe, it, expect } from 'vitest'
import { kantenHoehenAusGeschossen } from '../kanten-hoehen-aus-geschossen'

const rechteck = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]

describe('Gerüsthöhe je Kante aus Geschossen (synthetisch)', () => {
  const eg = { name: 'EG', obenM: 3, umriss: rechteck(0, 0, 14, 9) }
  it('OG kürzer als EG: Kanten ohne OG-Wand enden an der EG-Oberkante, Längsseiten reichen bis oben', () => {
    const og = { name: 'OG', obenM: 6, umriss: rechteck(2, 0, 12, 9) }
    // Kanten: 0 = z=0 (Längsseite), 1 = x=14 (Schmalseite), 2 = z=9 (Längsseite), 3 = x=0 (Schmalseite)
    expect(kantenHoehenAusGeschossen(eg.umriss, [eg, og], 6)).toEqual([6, 3, 6, 3])
  })
  it('OG deckt alle Kanten: nichts zu ändern (null)', () => {
    const og = { name: 'OG', obenM: 6, umriss: rechteck(0, 0, 14, 9) }
    expect(kantenHoehenAusGeschossen(eg.umriss, [eg, og], 6)).toBeNull()
  })
  it('OG nach hinten versetzt: die Vorderkante endet am EG', () => {
    const og = { name: 'OG', obenM: 6, umriss: rechteck(0, 3, 14, 9) }
    expect(kantenHoehenAusGeschossen(eg.umriss, [eg, og], 6)).toEqual([3, 6, 6, 6])
  })
  it('ein Geschoss allein: null; fremdes OG ohne Bezug zum Umriss: Kanten gelten nach dem EG', () => {
    expect(kantenHoehenAusGeschossen(eg.umriss, [eg], 3)).toBeNull()
    const og = { name: 'OG', obenM: 6, umriss: rechteck(20, 20, 24, 24) }
    expect(kantenHoehenAusGeschossen(eg.umriss, [eg, og], 6)).toEqual([3, 3, 3, 3])
  })
})
