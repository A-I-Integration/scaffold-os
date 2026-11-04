import { describe, it, expect } from 'vitest'
import { generateCADModel } from '../calculations/cad-engine'
import { KIRCHE_STANDARD, kircheAlsGebaeude, kircheUebernehmen, pruefeKircheMasse } from '../cad/kirche-vorlage'

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
  it('entfernt einen früheren Umriss, sonst würde die ganze Kirche eingerüstet', () => {
    const alt = { ...kircheAlsGebaeude(KIRCHE_STANDARD), umriss: [{ x: 0, z: 0 }, { x: 9, z: 0 }, { x: 9, z: 12 }, { x: 0, z: 12 }], sections: undefined }
    const neu = kircheUebernehmen(alt, KIRCHE_STANDARD)
    expect(neu.umriss).toBeUndefined()
    const m = generateCADModel(neu, 'layher-allround')
    expect(m.warnings.some((w) => w.code === 'UMRISS_MODUS')).toBe(false)
    expect(Math.max(...m.fields.map((f) => f.positionX))).toBeLessThan(-8)
  })
})

import { haubenHoehe, walmSockelHoehe, HAUBEN_PROFIL } from '@/lib/cad/haube'
describe('Turmhaube', () => {
  it('Profil: Radien ≥ 0, Höhen nicht fallend', () => {
    const p = HAUBEN_PROFIL['zwiebel-laterne']
    for (let i = 0; i < p.length; i++) { expect(p[i][1]).toBeGreaterThanOrEqual(0); if (i) expect(p[i][0]).toBeGreaterThanOrEqual(p[i - 1][0]) }
    expect(haubenHoehe('zwiebel-laterne')).toBeCloseTo(18.8, 5)
  })
  it('Walm-Sockel passt zum Zwiebelradius', () => {
    expect(walmSockelHoehe(4.57)).toBeCloseTo(5.3, 1)
    expect(walmSockelHoehe(2)).toBe(2.5)
  })
  it('Vorlage mit Haube: nur Darstellung, Gerüst unverändert', () => {
    const ohne = kircheAlsGebaeude({ ...KIRCHE_STANDARD, turmLaengeM: 9.14, turmBreiteM: 9.18, turmSchaftM: 31, helmM: 3, helmEinruesten: false })
    const mit = kircheAlsGebaeude({ ...KIRCHE_STANDARD, turmLaengeM: 9.14, turmBreiteM: 9.18, turmSchaftM: 31, helmM: 3, helmEinruesten: false, haube: true })
    expect(ohne.sections![0].haube).toBeUndefined()
    expect(mit.sections![0].haube).toBe('zwiebel-laterne')
    expect(mit.sections![0].hoeheM).toBe(ohne.sections![0].hoeheM)
    expect(mit.heightM).toBeCloseTo(31 + 18.8, 5)
  })
})
