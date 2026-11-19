import { describe, it, expect } from 'vitest'
import { calculateFieldDivision, generateCADModel, type BuildingParams } from '../cad-engine'
import { GERUEST_SYSTEME } from '../geruest-systeme'

// Restfeld-Regel (Entscheidung): Geht die Wand nicht auf Standardfelder auf, werden die letzten zwei Felder mit Katalogmaßen
// so gewählt, dass das Gerüst nie vor der Wand endet (kleinster Überstand); es gibt kein Feld mit Sonderlänge, und die Abweichung wird gemeldet.
describe('Restfeld: Passfeld mit Teilung', () => {
  for (const s of GERUEST_SYSTEME) {
    it(`${s.id}: nur Katalogmaße, Gerüst endet nicht vor der Wand, Überstand unter einem Feld`, () => {
      for (let l = 3; l <= 40; l += 0.37) {
        const d = calculateFieldDivision(l, s)
        for (const f of d.distribution) expect(s.feldlangenM, `${l} m`).toContain(f)
        const summe = d.distribution.reduce((a, b) => a + b, 0)
        expect(summe, `${l} m`).toBeGreaterThanOrEqual(l - 1e-6)
        expect(summe - l, `${l} m`).toBeLessThan(Math.max(...s.feldlangenM) + 1e-6)
      }
    })
  }
  it('Passfeld-Angaben stimmen mit der Verteilung überein; ohne Rest gibt es keins', () => {
    const s = GERUEST_SYSTEME.find((x) => x.id === 'mj-uniconnect')!
    const d = calculateFieldDivision(13.3, s)
    expect(d.passfeld).toBeDefined()
    const n = d.distribution.length
    expect([d.distribution[n - 2], d.distribution[n - 1]]).toEqual(d.passfeld!.laengenM)
    expect(d.passfeld!.laengenM[0] + d.passfeld!.laengenM[1] - d.passfeld!.sollM).toBeCloseTo(d.passfeld!.ueberstandM, 2)
    const exakt = calculateFieldDivision(s.standardFeldlangeM * 4, s)
    expect(exakt.passfeld).toBeUndefined()
    expect(calculateFieldDivision(1, s).passfeld).toBeUndefined()
  })
  it('das Modell meldet das Passfeld als Hinweis mit Überstand', () => {
    const haus: BuildingParams = { lengthM: 13.3, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [4, 4], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] }
    const m = generateCADModel(haus, 'mj-uniconnect')
    const w = m.warnings.find((x) => x.code === 'PASSFELD')
    expect(w?.type).toBe('info')
    expect(w?.message).toMatch(/Passfeld/)
    expect(w?.message).toMatch(/über/)
  })
})
