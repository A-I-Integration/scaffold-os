import { describe, it, expect } from 'vitest'
import { balkoneAusAufmassFuersCad, konsolenJeLage, type CadBalkon } from '../balkon'
import {
  generateCADModel, generateBuildingFeatures, generateBillOfMaterials, detectFeatureCollisions,
  feldEntlangFassade, type BuildingParams,
} from '../calculations/cad-engine'

const BASIS: BuildingParams = {
  lengthM: 20, widthM: 10, heightM: 10, eavesHeightM: 8, roofHeightM: 3, roofForm: 'satteldach', floors: 3, floorHeightsM: [],
  windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'],
}
const SYSTEM = 'layher-allround'
const bk = (p: Partial<CadBalkon> = {}): CadBalkon => ({
  id: 'b1', side: 'front', offsetAlongM: 0, widthM: 3, depthM: 1.0, floorIndex: 1, alleLagen: true, modus: 'durchlaufend', ...p,
})
const ko = (m: ReturnType<typeof generateCADModel>) => generateBillOfMaterials(m).find((x) => x.articleNumber === 'KO-001')?.quantity ?? 0
const fieldsOf = (m: ReturnType<typeof generateCADModel>, side: string, level = 0) => m.fields.filter((f) => f.side === side && f.levelIndex === level)

describe('CAD – Gebäudemerkmale: Balkone mit fester Position', () => {
  it('ohne balconies bleibt die automatische Verteilung (balconyCount) unverändert', () => {
    const f = generateBuildingFeatures({ ...BASIS, balconyCount: 2 }).filter((x) => x.type === 'balcony')
    expect(f).toHaveLength(2)
    expect(f.every((x) => x.modus === undefined)).toBe(true)
  })
  it('feste Balkone ersetzen balconyCount; "alle Lagen" = ein Balkon je Obergeschoss', () => {
    const f = generateBuildingFeatures({ ...BASIS, balconyCount: 5, balconies: [bk({ offsetAlongM: -4 })] }).filter((x) => x.type === 'balcony')
    expect(f.map((x) => x.floorIndex)).toEqual([1, 2])
    expect(f.every((x) => x.offsetAlongM === -4 && x.widthM === 3 && x.depthM === 1 && x.modus === 'durchlaufend')).toBe(true)
  })
  it('einzelnes Geschoss: genau ein Balkon', () => {
    const f = generateBuildingFeatures({ ...BASIS, balconies: [bk({ alleLagen: false, floorIndex: 2 })] }).filter((x) => x.type === 'balcony')
    expect(f).toHaveLength(1)
    expect(f[0].floorIndex).toBe(2)
  })
})

describe('CAD – ausgesparte Balkone', () => {
  const ohne = generateCADModel(BASIS, SYSTEM)
  const mit = generateCADModel({ ...BASIS, balconies: [bk({ modus: 'ausgespart', widthM: 3 })] }, SYSTEM)
  const von = -1.5, bis = 1.5

  it('vor dem Balkon steht in KEINER Lage ein Feld, daneben bleiben die Felder', () => {
    for (const f of mit.fields.filter((x) => x.side === 'front')) {
      const a = feldEntlangFassade(f.side, f.positionX, f.positionZ, mit.building)
      expect(Math.min(a + f.lengthM / 2, bis) - Math.max(a - f.lengthM / 2, von)).toBeLessThanOrEqual(0.02)
    }
    const entfernt = fieldsOf(ohne, 'front').length - fieldsOf(mit, 'front').length
    expect(entfernt).toBeGreaterThanOrEqual(2) // 3 m Breite bei ~2 m Feldern
    expect(fieldsOf(mit, 'front').length).toBeGreaterThan(0)
    // in jeder Lage gleich viele Felder entfernt
    for (let l = 0; l < ohne.levelCount; l++) expect(ohne.fields.filter((f) => f.levelIndex === l).length - mit.fields.filter((f) => f.levelIndex === l).length).toBe(entfernt)
  })
  it('Stückliste, Länge, Fläche und Feldanzahl werden gekürzt', () => {
    const rahmen = (m: typeof ohne) => generateBillOfMaterials(m).filter((x) => x.articleNumber.startsWith('RA-')).reduce((s, x) => s + x.quantity, 0)
    expect(rahmen(mit)).toBeLessThan(rahmen(ohne))
    const entferntLaenge = fieldsOf(ohne, 'front').reduce((s, f) => s + f.lengthM, 0) - fieldsOf(mit, 'front').reduce((s, f) => s + f.lengthM, 0)
    expect(mit.totalLengthM).toBeCloseTo(ohne.totalLengthM - entferntLaenge, 5)
    expect(mit.totalAreaM2).toBeCloseTo(ohne.totalAreaM2 - entferntLaenge * BASIS.heightM, 5)
    expect(mit.fieldCount).toBe(ohne.fieldCount - (fieldsOf(ohne, 'front').length - fieldsOf(mit, 'front').length))
  })
  it('Anker im ausgesparten Bereich entfallen', () => {
    const imLoch = mit.anchors.filter((a) => a.side === 'front' && a.positionX > von + 0.02 && a.positionX < bis - 0.02)
    expect(imLoch).toHaveLength(0)
    expect(mit.anchors.length).toBeLessThanOrEqual(ohne.anchors.length)
  })
  it('Hinweis BALKON_AUSGESPART; keine Kollisionswarnung für ausgesparte Balkone', () => {
    expect(mit.warnings.some((w) => w.code === 'BALKON_AUSGESPART')).toBe(true)
    const w = detectFeatureCollisions(mit, generateBuildingFeatures(mit.building))
    expect(w.some((x) => x.code === 'BALKON_KOLLISION')).toBe(false)
  })
  it('funktioniert auch an der linken Seite', () => {
    const b2 = { ...BASIS, sides: ['front', 'left'] as BuildingParams['sides'] }
    const o = generateCADModel(b2, SYSTEM)
    const m = generateCADModel({ ...b2, balconies: [bk({ side: 'left', modus: 'ausgespart', widthM: 3, offsetAlongM: 0 })] }, SYSTEM)
    expect(fieldsOf(m, 'left').length).toBeLessThan(fieldsOf(o, 'left').length)
    expect(fieldsOf(m, 'front').length).toBe(fieldsOf(o, 'front').length)
  })
})

describe('CAD – durchlaufende Balkone (Konsolen)', () => {
  const ohne = generateCADModel(BASIS, SYSTEM)
  it('ohne Balkon keine Konsolen', () => { expect(ko(ohne)).toBe(0) })

  it('Konsolen = Lagen × (überdeckte Felder + 1) × aufgerundet(Auskragung / 0,73)', () => {
    const m = generateCADModel({ ...BASIS, balconies: [bk({ widthM: 3, depthM: 1.0 })] }, SYSTEM)
    const spalten = fieldsOf(ohne, 'front').filter((f) => {
      const a = feldEntlangFassade(f.side, f.positionX, f.positionZ, ohne.building)
      return Math.min(a + f.lengthM / 2, 1.5) - Math.max(a - f.lengthM / 2, -1.5) > 0.02
    }).length
    expect(spalten).toBeGreaterThanOrEqual(2)
    expect(ko(m)).toBe(ohne.levelCount * konsolenJeLage(spalten, 1.0))
    expect(m.fields.length).toBe(ohne.fields.length) // Felder bleiben
    expect(m.warnings.some((w) => w.code === 'BALKON_KONSOLEN')).toBe(true)
  })
  it('nur ein Geschoss: weniger Konsolen als über alle Lagen', () => {
    const alle = ko(generateCADModel({ ...BASIS, balconies: [bk()] }, SYSTEM))
    const eins = ko(generateCADModel({ ...BASIS, balconies: [bk({ alleLagen: false, floorIndex: 1 })] }, SYSTEM))
    expect(eins).toBeGreaterThan(0)
    expect(eins).toBeLessThan(alle)
  })
  it('Auskragung 0 → keine Konsolen; größere Auskragung → mehr Konsolen', () => {
    expect(ko(generateCADModel({ ...BASIS, balconies: [bk({ depthM: 0 })] }, SYSTEM))).toBe(0)
    const a = ko(generateCADModel({ ...BASIS, balconies: [bk({ depthM: 0.7 })] }, SYSTEM))
    const b = ko(generateCADModel({ ...BASIS, balconies: [bk({ depthM: 1.5 })] }, SYSTEM))
    expect(b).toBe(a * 3) // 1 Konsole je Stelle vs. 3 (1,5 / 0,73 → 3)
  })
  it('Konsolen-Bauteile liegen auf der Wandseite der Felder (näher am Gebäude)', () => {
    const m = generateCADModel({ ...BASIS, balconies: [bk({ depthM: 0.7 })] }, SYSTEM)
    const k = m.components3D.filter((c) => c.articleNumber === 'KO-001')
    expect(k.length).toBeGreaterThan(0)
    const feldZ = fieldsOf(m, 'front')[0].positionZ
    expect(k.every((c) => c.position[2] < feldZ)).toBe(true)
  })
})

describe('CAD – Konsolen an allen Seiten auf der Wandseite', () => {
  for (const side of ['front', 'back', 'left', 'right'] as const) {
    it(`Seite ${side}: Konsolen liegen näher am Gebäude als die Felder`, () => {
      const m = generateCADModel({ ...BASIS, sides: [side], balconies: [bk({ side, depthM: 0.7 })] }, SYSTEM)
      const k = m.components3D.filter((c) => c.articleNumber === 'KO-001')
      expect(k.length).toBeGreaterThan(0)
      const mitte = [0, -BASIS.widthM / 2 - 0.5] // Gebäudemitte (x, z)
      const feld = fieldsOf(m, side)[0]
      const dFeld = side === 'front' || side === 'back' ? Math.abs(feld.positionZ - mitte[1]) : Math.abs(feld.positionX - mitte[0])
      for (const c of k) {
        const d = side === 'front' || side === 'back' ? Math.abs(c.position[2] - mitte[1]) : Math.abs(c.position[0] - mitte[0])
        expect(d).toBeLessThan(dFeld)
      }
    })
  }
})

describe('Übernahme aus dem Aufmaß', () => {
  const roh = [
    { abschnitt: '0', breite: '3', anzahl: '2', auskragung: '1,2', modus: 'durchlaufend' },
    { abschnitt: '0', breite: '2', anzahl: '1', auskragung: '0', modus: 'ausgespart' },
    { abschnitt: '1', breite: '4', anzahl: '3', modus: 'durchlaufend' },
  ]
  it('verteilt die Balkone der Hauptfassade gleichmäßig; weitere Abschnitte werden gezählt, nicht übernommen', () => {
    const r = balkoneAusAufmassFuersCad(roh, 20, 3)
    expect(r.balkone).toHaveLength(3)
    expect(r.uebersprungen).toBe(3)
    expect(r.balkone.map((b) => b.offsetAlongM)).toEqual([-5, 0, 5])
    expect(r.balkone.map((b) => b.widthM)).toEqual([3, 3, 2])
    expect(r.balkone.every((b) => b.side === 'front' && b.alleLagen && b.floorIndex === 1)).toBe(true)
    expect(r.balkone[2].modus).toBe('ausgespart')
  })
  it('eingeschossig → Geschoss 0; ohne Balkone leer', () => {
    expect(balkoneAusAufmassFuersCad(roh, 20, 1).balkone[0].floorIndex).toBe(0)
    expect(balkoneAusAufmassFuersCad(undefined, 20, 3)).toEqual({ balkone: [], uebersprungen: 0 })
  })
})
