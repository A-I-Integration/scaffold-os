import { describe, it, expect } from 'vitest'
import { tuerPlatzierungGestuft } from '@/components/cad/Scaffold3D'

const seg = [
  { mitteX: 4.5, mitteZ: 0, laengeM: 9, tiefeM: 9 },
  { mitteX: 14.5, mitteZ: 0, laengeM: 11, tiefeM: 9, versatzM: 0 },
]
const tuer = { side: 'front' as const, offsetAlongM: 0, bottomY: 0, heightM: 3 }

describe('Tür am gestuften Gebäude', () => {
  it('liegt in der Mitte der Gesamtlänge im passenden Abschnitt, an der Vorderwand', () => {
    const t = tuerPlatzierungGestuft(tuer, seg, 20, 9)!
    expect(t.pos[0]).toBeCloseTo(10, 5) // Gesamtlänge/2 → Abschnitt 2 (9 … 20)
    expect(t.pos[1]).toBeCloseTo(1.5, 5)
    expect(t.pos[2]).toBeCloseTo(4.5 + 0.02, 5)
    expect(t.rot).toEqual([0, 0, 0])
  })
  it('Tür im ersten Abschnitt, hinten und seitlich', () => {
    expect(tuerPlatzierungGestuft({ ...tuer, offsetAlongM: -5 }, seg, 20, 9)!.pos[0]).toBeCloseTo(5, 5)
    expect(tuerPlatzierungGestuft({ ...tuer, side: 'back' }, seg, 20, 9)!.pos[2]).toBeCloseTo(-4.52, 5)
    const l = tuerPlatzierungGestuft({ ...tuer, side: 'left', offsetAlongM: 1 }, seg, 20, 9)!
    expect(l.pos[0]).toBeCloseTo(-0.02, 5); expect(l.pos[2]).toBeCloseTo(1, 5)
    expect(tuerPlatzierungGestuft({ ...tuer, side: 'right' }, seg, 20, 9)!.pos[0]).toBeCloseTo(20.02, 5)
  })
  it('außerhalb aller Abschnitte: keine Tür', () => {
    expect(tuerPlatzierungGestuft({ ...tuer, offsetAlongM: 15 }, seg, 20, 9)).toBeNull()
  })
})
