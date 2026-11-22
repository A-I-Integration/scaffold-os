// Umriss-Modus am Hang mit geneigtem Dach: der oberste Belag liegt auf Traufe + 1 m (wie im Rechteck-Modus),
// nicht auf einem Raster, das am tiefsten Geländepunkt beginnt (Regression: Pultdach-EFH am Hang, Gerüst endete ca. 1,9 m zu tief).
import { describe, it, expect } from 'vitest'
import { generateCADModel, BELAG_UEBER_RINNE_M, type BuildingParams } from '@/lib/calculations/cad-engine'

const umriss = [
  { x: -8.54, z: -7.11 }, { x: -4.18, z: -7.11 }, { x: -4.18, z: -5.61 }, { x: 2.13, z: -5.53 },
  { x: 2.13, z: 3.15 }, { x: -11.65, z: 3.23 }, { x: -11.65, z: -5.61 }, { x: -8.54, z: -5.61 },
]
const basis: BuildingParams = {
  lengthM: 13.78, widthM: 10.34, heightM: 6.94, eavesHeightM: 5.92, roofHeightM: 1.02, roofForm: 'pultdach', floors: 3, floorHeightsM: [],
  windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, sides: ['front', 'back', 'left', 'right'], umriss,
}
const obersterBelag = (b: BuildingParams) => {
  const m = generateCADModel(b, 'mj-uniconnect')
  return { m, top: Math.max(...m.levels.filter((l) => l.fields.length > 0).map((l) => l.topY)) }
}

describe('Umriss + Hang + Pultdach', () => {
  const hang = { gelaendeEckenM: { fl: -2.95, fr: 0, bl: -2.95, br: 0 }, pultNiedrigeSeite: 'right' as const }
  it('ohne Hang: oberster Belag auf Traufe + 1 m (Raster ab ±0,00)', () => {
    const { top } = obersterBelag({ ...basis, geruestOptionen: { pultNiedrigeSeite: 'right' } })
    expect(top).toBeCloseTo(6, 2)
  })
  it('mit Hang, Pultdach: oberster Belag mindestens auf der höchsten Dachkante (Geländer überragt sie um 1 m)', () => {
    const { top } = obersterBelag({ ...basis, geruestOptionen: hang })
    expect(top).toBeGreaterThanOrEqual(basis.heightM - 1e-6)
    expect(top).toBeCloseTo(Math.max(basis.eavesHeightM + BELAG_UEBER_RINNE_M, basis.heightM), 2)
  })
  it('mit Hang: alle Lagen liegen auf demselben Raster (2 m) und enden an der Rinne', () => {
    const { m } = obersterBelag({ ...basis, geruestOptionen: hang })
    const tops = m.levels.map((l) => l.topY)
    tops.slice(1).forEach((t, i) => expect(t - tops[i]).toBeCloseTo(2, 2))
  })
  it('System ohne belegte Ausgleichsdaten (MJ Uni-Connect): Fuß erreicht das Gelände mit gekennzeichneter Annahme', () => {
    const { m } = obersterBelag({ ...basis, geruestOptionen: hang })
    const w = m.warnings.find((x) => x.code === 'HANG_AUSGLEICH_ANNAHME')
    expect(w).toBeDefined()
    expect(w!.message).toMatch(/Annahme/)
    expect(m.warnings.some((x) => x.code === 'HANG_AUSGLEICH_FEHLT')).toBe(false)
    expect(m.fields.filter((f) => f.fuss).length).toBeGreaterThan(0)
  })
  it('ohne Hang keine Ausgleichs-Warnung', () => {
    const { m } = obersterBelag({ ...basis, geruestOptionen: { pultNiedrigeSeite: 'right' } })
    expect(m.warnings.some((x) => x.code === 'HANG_AUSGLEICH_FEHLT' || x.code === 'HANG_AUSGLEICH_ANNAHME')).toBe(false)
  })
})
