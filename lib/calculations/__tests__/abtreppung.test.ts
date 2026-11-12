import { describe, it, expect } from 'vitest'
import { abtreppungJeFeld, gelaendeAn } from '../abtreppung'
import { findeSystem } from '../geruest-systeme'

const SYS = findeSystem('layher-allround')!

describe('gelaendeAn', () => {
  it('interpoliert linear und begrenzt auf [0,1]', () => {
    expect(gelaendeAn(0, -2.95, 0)).toBe(0)
    expect(gelaendeAn(0, -2.95, 1)).toBe(-2.95)
    expect(gelaendeAn(0, -2.95, 0.5)).toBeCloseTo(-1.475, 5)
  })
})

describe('abtreppungJeFeld (Layher Allround)', () => {
  it('ebenes Gelände: kein Ausgleich, kein Stiel, keine Spindel', () => {
    const r = abtreppungJeFeld(0, 0, [2.07, 2.07, 2.07], SYS)!
    expect(r.every((f) => f.ausgleichM === 0 && f.stielM === 0 && f.spindelM === 0)).toBe(true)
  })
  it('Hang 0 → -2,95 über 3 Felder: Fuß treppt ab, Ausgleich < Raster, Spindel im zulässigen Weg', () => {
    const r = abtreppungJeFeld(0, -2.95, [2.07, 2.07, 2.07], SYS)!
    expect(r.length).toBe(3)
    // Gelände fällt monoton
    expect(r[0].gelaendeM).toBeGreaterThan(r[2].gelaendeM)
    for (const f of r) {
      expect(f.ausgleichM).toBeGreaterThanOrEqual(0)
      expect(f.ausgleichM).toBeLessThan(SYS.rasterHoeheM)
      // Stiel + Spindel überbrücken den Ausgleich
      expect(f.stielM + f.spindelM).toBeCloseTo(f.ausgleichM, 2)
      // Stiel ist eine Standardlänge
      expect([0, 0.5, 1, 1.5, 2, 3]).toContain(f.stielM)
      // Spindel nie über der verstärkten Grenze
      expect(f.spindelM).toBeLessThanOrEqual(0.55 + 1e-9)
    }
  })
  it('nutzt die Standardspindel (≤0,41) wo möglich, sonst markiert es die verstärkte', () => {
    const r = abtreppungJeFeld(0, -5.8, [2.07, 2.07, 2.07], SYS)!
    for (const f of r) if (!f.spindel80) expect(f.spindelM).toBeLessThanOrEqual(0.41 + 1e-9)
  })
  it('ohne Ausgleichsdaten des Systems: null', () => {
    const peri = findeSystem('peri-up-flex')!
    expect(abtreppungJeFeld(0, -2, [2, 2], peri)).toBeNull()
  })
})
