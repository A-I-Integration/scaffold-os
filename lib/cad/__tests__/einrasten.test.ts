import { describe, it, expect } from 'vitest'
import { PortIndex, schlageEinrastenVor, rasteWinkel } from '@/lib/cad/einrasten'
import type { PortBauteil } from '@/lib/cad/anschluesse'

const rahmen = (id: string, x: number, y: number, z = 0): PortBauteil => ({ id, type: 'frame', position: [x, y, z], rotation: [0, 0, 0], scale: [0.05, 2, 0.05], rahmenBreiteM: 0.73 })

describe('Einrasten', () => {
  const unten = rahmen('u', 0, 1)
  const index = new PortIndex([unten])

  it('rastet einen leicht versetzten Rahmen oben auf, an beiden Stielen', () => {
    const v = schlageEinrastenVor(rahmen('n', 0.04, 3.06), index)!
    expect(v.anzahl).toBe(2)
    expect(v.versatz[0]).toBeCloseTo(-0.04, 6)
    expect(v.versatz[1]).toBeCloseTo(-0.06, 6)
    expect(v.weiteM).toBeCloseTo(Math.hypot(0.04, 0.06), 6)
  })
  it('außerhalb des Radius passiert nichts', () => {
    expect(schlageEinrastenVor(rahmen('n', 0, 3.5), index)).toBeNull()
  })
  it('auf den Kopf gedrehter Rahmen rastet nicht (Kopf trifft Kopf)', () => {
    const k = { ...rahmen('n', 0, 3.02), rotation: [Math.PI, 0, 0] as [number, number, number] }
    expect(schlageEinrastenVor(k, index)).toBeNull()
  })
  it('das Bauteil rastet nicht an sich selbst ein', () => {
    expect(schlageEinrastenVor(rahmen('u', 0, 3.02), new PortIndex([rahmen('u', 0, 3.02)]))).toBeNull()
  })
  it('bevorzugt Einrasten mit mehr verbundenen Punkten', () => {
    const idx = new PortIndex([unten, rahmen('weit', 1.2, 1)])
    const v = schlageEinrastenVor(rahmen('n', 0.02, 3.02), idx)!
    expect(v.anzahl).toBe(2)
    expect(Math.abs(v.versatz[0])).toBeLessThan(0.05)
  })
  it('Bauteil ohne Anschlusspunkte: null', () => {
    expect(schlageEinrastenVor({ id: 'n', type: 'net', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, index)).toBeNull()
  })
  it('Index zählt Punkte', () => { expect(index.anzahl).toBe(4) })
})

describe('Winkel', () => {
  it('rastet nahe 90° ein, lässt andere Winkel', () => {
    expect(rasteWinkel(87)).toBe(90)
    expect(rasteWinkel(-93)).toBe(-90)
    expect(rasteWinkel(45)).toBe(45)
    expect(rasteWinkel(2)).toBe(0)
  })
})
