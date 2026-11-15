import { describe, it, expect } from 'vitest'
import { fassadenFlaechenAusGeschossen } from '../fassaden-flaechen'

const rect = (x0: number, z0: number, x1: number, z1: number) => [
  { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
]

describe('fassadenFlaechenAusGeschossen', () => {
  it('liefert vier Fassadenflächen für ein einzelnes Geschoss', () => {
    const r = fassadenFlaechenAusGeschossen([{ name: 'EG', obenM: 3, umriss: rect(0, 0, 10, 8) }])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.flaechen).toHaveLength(4)
    expect(r.gesamtFlaecheM2).toBeCloseTo(2 * (10 + 8) * 3)
  })

  it('bildet beim zurückgesetzten Obergeschoss die zusätzliche Fassadenstufe ab', () => {
    const r = fassadenFlaechenAusGeschossen([
      { name: 'EG', obenM: 3, umriss: rect(0, 0, 12, 10) },
      { name: 'OG', obenM: 6, umriss: rect(2, 2, 10, 8) },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const og = r.flaechen.filter((f) => f.geschoss === 'OG')
    expect(og.length).toBeGreaterThanOrEqual(4)
    expect(og.every((f) => f.untenM === 3 && f.obenM === 6)).toBe(true)
    // EG-Außenwand: Umfang 44 m × 3 m; OG-Rücksprung: Umfang 28 m × 3 m.
    expect(r.gesamtFlaecheM2).toBeCloseTo(44 * 3 + 28 * 3)
  })

  it('bildet einen weiteren Dachgeschoss-Rücksprung als eigene Fassadenebene ab', () => {
    const r = fassadenFlaechenAusGeschossen([
      { name: 'EG', obenM: 3, umriss: rect(0, 0, 12, 10) },
      { name: 'OG', obenM: 6, umriss: rect(2, 2, 10, 8) },
      { name: 'DG', obenM: 8.5, umriss: rect(4, 3, 8, 7) },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.flaechen.some((f) => f.geschoss === 'DG' && f.untenM === 6 && f.obenM === 8.5)).toBe(true)
    expect(r.hoechsteM).toBe(8.5)
  })

  it('lehnt schräge Konturen ab, statt eine falsche Fassadenfläche zu liefern', () => {
    const r = fassadenFlaechenAusGeschossen([{ name: 'OG', obenM: 6, umriss: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 4, z: 5 }] }])
    expect(r.ok).toBe(false)
  })

  it('lehnt fehlende oder ungültige Oberkanten ab', () => {
    const r = fassadenFlaechenAusGeschossen([{ name: 'EG', obenM: 0, umriss: rect(0, 0, 10, 8) }])
    expect(r.ok).toBe(false)
  })
})
