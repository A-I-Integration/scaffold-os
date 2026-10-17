import { describe, it, expect } from 'vitest'
import { ansichtAusProjektdaten } from '../ansicht-link'

const daten = (umriss: unknown) => ({
  kiResult: { systemId: 'layher-allround', building: { lengthM: 10, widthM: 8, heightM: 8, floors: 2, umriss } },
})

describe('ansichtAusProjektdaten: Umriss', () => {
  it('übernimmt einen gültigen Umriss', () => {
    const r = ansichtAusProjektdaten(daten([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }]))
    expect(r?.building.umriss).toHaveLength(4)
  })
  it('lässt einen ungültigen oder manipulierten Umriss weg', () => {
    expect(ansichtAusProjektdaten(daten([{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 4, z: 0 }, { x: 0, z: 4 }]))?.building.umriss).toBeUndefined()
    expect(ansichtAusProjektdaten(daten([{ x: 0, z: 0 }, { x: 'a', z: 0 }, { x: 5, z: 5 }]))?.building.umriss).toBeUndefined()
    expect(ansichtAusProjektdaten(daten('boese'))?.building.umriss).toBeUndefined()
    expect(ansichtAusProjektdaten(daten([{ x: 0, z: 0, preis: 5 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }]))?.building.umriss?.[0]).toEqual({ x: 0, z: 0 })
  })
})
