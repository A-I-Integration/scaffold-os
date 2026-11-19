import { describe, it, expect } from 'vitest'
import { statusEintraege } from '../CadStatusleiste'

const basis = { systemName: 'MJ Gerüst Uni-Connect', ansicht: '3d' as const, einrasten: true, anschlussEinrasten: true, auswahlAnzahl: 2, bauteilAnzahl: 1234, flaecheM2: 150.25, gewichtKg: 4321 }
describe('CAD-Statusleiste', () => {
  it('zeigt die bekannten Werte deutsch formatiert', () => {
    const e = Object.fromEntries(statusEintraege(basis).map((x) => [x.label, x.wert]))
    expect(e.System).toBe('MJ Gerüst Uni-Connect')
    expect(e.Bauteile).toBe('1.234')
    expect(e.Fläche).toBe('150,3 m²')
    expect(e.Gewicht).toBe('4.321 kg')
    expect(e.Einrasten).toBe('Raster + Anschlüsse')
  })
  it('lässt fehlende Werte weg statt Nullen zu erfinden', () => {
    const l = statusEintraege({ ...basis, bauteilAnzahl: null, flaecheM2: null, gewichtKg: 0, systemName: null, einrasten: false, anschlussEinrasten: false }).map((x) => x.label)
    expect(l).not.toContain('Bauteile'); expect(l).not.toContain('Fläche'); expect(l).not.toContain('Gewicht')
    expect(statusEintraege({ ...basis, einrasten: false, anschlussEinrasten: false }).find((x) => x.label === 'Einrasten')?.wert).toBe('aus')
  })
})
