import { describe, it, expect } from 'vitest'
import { generateCADModel } from '../calculations/cad-engine'
import { KIRCHE_STANDARD, kircheAlsGebaeude, pruefeKircheMasse } from '../cad/kirche-vorlage'

describe('Kirchenvorlage', () => {
  it('rüstet nur den Turm ein, Schiff und Chor bleiben ohne Gerüst', () => {
    const b = kircheAlsGebaeude({ ...KIRCHE_STANDARD, chorLaengeM: 10 })
    expect(b.sections!.map((s) => s.geruest)).toEqual([undefined, false, false])
    const m = generateCADModel(b, 'layher-allround')
    const xs = m.fields.map((f) => f.positionX)
    // Turm liegt links: x von −24,5 … −15,5 (Gesamtlänge 49 m); kein Gerüst über Schiff/Chor hinaus
    expect(Math.max(...xs)).toBeLessThan(-14)
    expect(m.totalHeightM).toBe(58)
    expect(m.fields.some((f) => f.side === 'right')).toBe(true)
    expect(m.fieldCount).toBeGreaterThan(0)
  })
  it('prüft die Maße', () => {
    expect(pruefeKircheMasse(KIRCHE_STANDARD)).toBeNull()
    expect(pruefeKircheMasse({ ...KIRCHE_STANDARD, turmSchaftM: 10 })).toMatch(/höher/)
    expect(pruefeKircheMasse({ ...KIRCHE_STANDARD, breiteM: NaN })).toMatch(/Breite/)
  })
  it('Helm optional einrüsten', () => {
    const mit = generateCADModel(kircheAlsGebaeude(KIRCHE_STANDARD), 'layher-allround')
    const ohne = generateCADModel(kircheAlsGebaeude({ ...KIRCHE_STANDARD, helmEinruesten: false }), 'layher-allround')
    expect(mit.totalHeightM).toBeGreaterThan(ohne.totalHeightM)
  })
  it('setzt Anker auch am Helm', () => {
    const m = generateCADModel(kircheAlsGebaeude(KIRCHE_STANDARD), 'layher-allround')
    expect(m.anchors.some((a) => a.positionY > 46)).toBe(true)
    const ohne = generateCADModel(kircheAlsGebaeude({ ...KIRCHE_STANDARD, helmEinruesten: false }), 'layher-allround')
    expect(ohne.anchors.some((a) => a.positionY > 46)).toBe(false)
  })
})
