import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../calculations/cad-engine'

// Kirchturm (58 m) links am Schiff (14 m). Nur der Turm wird eingerüstet.
const basis: BuildingParams = {
  lengthM: 39, widthM: 9, heightM: 58, eavesHeightM: 58, roofHeightM: 0, roofForm: 'flachdach',
  floors: 12, floorHeightsM: Array(12).fill(58 / 12), windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0,
  sides: ['front', 'back', 'left'],
  sections: [
    { bezeichnung: 'Turm', laengeM: 9, hoeheM: 58, roofForm: 'walmdach', roofHoeheM: 13 },
    { bezeichnung: 'Schiff', laengeM: 30, hoeheM: 14, roofForm: 'satteldach', roofHoeheM: 6, geruest: false },
  ],
}

describe('Abschnitt ohne Gerüst', () => {
  it('rüstet nur den Turm ein', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const xMax = Math.max(...m.fields.filter((f) => f.side === 'front').map((f) => f.positionX + f.lengthM / 2))
    // Turm liegt bei x = -19,5 … -10,5
    expect(xMax).toBeLessThanOrEqual(-10.5 + 1e-6)
    // vorne, hinten und links am 9 m breiten Turm: 3 × 9 × 58
    expect(m.totalAreaM2).toBeCloseTo(3 * 9 * 58, 6)
    expect(m.totalHeightM).toBe(58)
    expect(m.fields.some((f) => f.side === 'right')).toBe(false)
    expect(m.warnings.some((w) => w.code === 'SECTIONS_TEIL_GERUEST')).toBe(true)
  })
  it('ohne Flag bleibt alles wie bisher (Schiff wird mit eingerüstet)', () => {
    const b = { ...basis, sections: basis.sections!.map((s) => { const { geruest: _g, ...r } = s; return r }) }
    const m = generateCADModel(b, 'layher-allround')
    // vorne + hinten: 2 × (9 × 58 + 30 × 14), links: 9 × 58
    expect(m.totalAreaM2).toBeCloseTo(2 * (9 * 58 + 30 * 14) + 9 * 58, 6)
    expect(Math.max(...m.fields.filter((f) => f.side === 'front').map((f) => f.positionX + f.lengthM / 2))).toBeGreaterThan(10)
  })
  it('meldet einen Fehler, wenn nichts eingerüstet wird', () => {
    const b = { ...basis, sections: basis.sections!.map((s) => ({ ...s, geruest: false })) }
    expect(generateCADModel(b, 'layher-allround').warnings.some((w) => w.code === 'SECTIONS_KEIN_GERUEST')).toBe(true)
  })
  it('setzt keine Schutzdächer vor das nicht eingerüstete Schiff', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const roofs = m.components3D.filter((c) => c.type === 'protection_roof')
    expect(roofs.every((c) => c.position[0] < -10)).toBe(true)
  })

  it('Turmhelm: Lagen über dem Schaft werden nach innen versetzt und kürzer', () => {
    const b: BuildingParams = { ...basis, sections: [
      { bezeichnung: 'Turm', laengeM: 9, hoeheM: 45, roofForm: 'walmdach', roofHoeheM: 13, helmGeruest: true },
      { bezeichnung: 'Schiff', laengeM: 30, hoeheM: 14, roofForm: 'satteldach', roofHoeheM: 6, geruest: false },
    ] }
    const m = generateCADModel(b, 'layher-allround')
    expect(m.totalHeightM).toBe(58)
    const vorne = m.fields.filter((f) => f.side === 'front')
    const laengeJeLage = new Map<number, number>()
    const zJeLage = new Map<number, number>()
    for (const f of vorne) { laengeJeLage.set(f.levelIndex, (laengeJeLage.get(f.levelIndex) ?? 0) + f.lengthM); zJeLage.set(f.levelIndex, f.positionZ) }
    const lagen = [...laengeJeLage.keys()].sort((a, c) => a - c)
    const oben = lagen[lagen.length - 1]
    const schaftLetzte = lagen.find((i) => (m.levels.find((l) => l.index === i)?.bottomY ?? 0) >= 45)!
    expect(oben).toBeGreaterThan(schaftLetzte - 1)
    expect(laengeJeLage.get(oben)!).toBeLessThan(laengeJeLage.get(0)! - 2)
    // je höher, desto weiter innen (kleineres z an der Vorderseite) und kürzer
    expect(zJeLage.get(oben)!).toBeLessThan(zJeLage.get(0)!)
    // Gerüstfläche enthält Schaft + Helm
    expect(m.totalAreaM2).toBeGreaterThan(3 * 9 * 45)
    // keine Felder über der Dachspitze
    expect(Math.max(...m.fields.map((f) => f.positionY))).toBeLessThan(58)
  })
  it('ohne helmGeruest endet das Gerüst am Schaft', () => {
    const b: BuildingParams = { ...basis, sections: [
      { bezeichnung: 'Turm', laengeM: 9, hoeheM: 45, roofForm: 'walmdach', roofHoeheM: 13 },
      { bezeichnung: 'Schiff', laengeM: 30, hoeheM: 14, geruest: false },
    ] }
    const m = generateCADModel(b, 'layher-allround')
    expect(m.totalHeightM).toBe(45)
  })
})

describe('Wand verdeckt bis Höhe', () => {
  it('rüstet die Turmwand erst ab der Höhe des davorstehenden Gebäudes ein', () => {
    const ohne = generateCADModel(basis, 'layher-allround')
    const b: BuildingParams = { ...basis, sections: basis.sections!.map((s, i) => (i === 0 ? { ...s, geruestAbHoeheM: { left: 14 } } : s)) }
    const m = generateCADModel(b, 'layher-allround')
    const links = m.fields.filter((f) => f.side === 'left')
    expect(links.length).toBeGreaterThan(0)
    expect(Math.min(...links.map((f) => f.positionY))).toBeGreaterThanOrEqual(12)
    expect(m.fields.filter((f) => f.side === 'front').length).toBe(ohne.fields.filter((f) => f.side === 'front').length)
    // Fläche der linken Wand: 9 m × (58 − ~14) statt 9 × 58
    expect(m.totalAreaM2).toBeLessThan(ohne.totalAreaM2 - 9 * 12)
    expect(m.totalAreaM2).toBeGreaterThan(ohne.totalAreaM2 - 9 * 16)
  })
})

describe('Turmwand zum Schiff', () => {
  it('rüstet die Turmwand zum Schiff erst über dem Schiffdach ein', () => {
    const b: BuildingParams = { ...basis, sides: ['front', 'back', 'left', 'right'] }
    const m = generateCADModel(b, 'layher-allround')
    const rechts = m.fields.filter((f) => f.side === 'right')
    expect(rechts.length).toBeGreaterThan(0)
    // Das Gerüst steht auf dem Satteldach: an der Traufe (14 m) beginnt es, in der Mitte am First (20 m)
    expect(Math.min(...rechts.map((f) => f.positionY))).toBeGreaterThanOrEqual(14 - 2.5)
    const mitteZ = -9 / 2 - 0.5
    const mitte = rechts.filter((f) => Math.abs(f.positionZ - mitteZ) < 1)
    const rand = rechts.filter((f) => Math.abs(f.positionZ - mitteZ) > 3)
    expect(Math.min(...mitte.map((f) => f.positionY))).toBeGreaterThanOrEqual(20 - 2.5)
    expect(Math.min(...rand.map((f) => f.positionY))).toBeLessThan(Math.min(...mitte.map((f) => f.positionY)))
    // Wand liegt an der Grenze Turm/Schiff (x = −10,5 + 0,5 + Abstand)
    expect(Math.min(...rechts.map((f) => f.positionX))).toBeGreaterThan(-10.5)
    expect(Math.max(...rechts.map((f) => f.positionX))).toBeLessThan(-8)
    // Fläche: 3 Außenwände + obere Hälfte der Innenwand (9 m × (58 − ~20))
    const ohne = generateCADModel(basis, 'layher-allround').totalAreaM2
    expect(m.totalAreaM2).toBeGreaterThan(ohne + 9 * 30)
    expect(m.totalAreaM2).toBeLessThan(ohne + 9 * 42)
  })
})

describe('Leerer Abschnitt (Länge/Höhe 0) und Einzelabschnitt', () => {
  const turm = (ab?: Record<string, number>): BuildingParams => ({
    lengthM: 9.15, widthM: 9.15, heightM: 31, eavesHeightM: 31, roofHeightM: 0, roofForm: 'flachdach',
    floors: 10, floorHeightsM: Array(10).fill(3.1), windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0,
    sides: ['front', 'back', 'left', 'right'],
    sections: [
      { bezeichnung: 'Anbau 1', laengeM: 0, hoeheM: 0, geruest: false },
      { bezeichnung: 'Hauptbau', laengeM: 9.15, hoeheM: 31, tiefeM: 9.15, roofForm: 'flachdach', roofHoeheM: 0, ...(ab ? { geruestAbHoeheM: ab } : {}) },
    ],
  })
  it('beachtet „Wand verdeckt bis Höhe“, auch wenn ein leerer Abschnitt in der Liste steht', () => {
    const ohne = generateCADModel(turm(), 'layher-allround')
    for (const seite of ['front', 'back', 'left', 'right'] as const) {
      const m = generateCADModel(turm({ [seite]: 17 }), 'layher-allround')
      const f = m.fields.filter((x) => x.side === seite)
      expect(f.length).toBeGreaterThan(0)
      expect(Math.min(...f.map((x) => x.positionY))).toBeGreaterThanOrEqual(15)
      expect(m.totalAreaM2).toBeLessThan(ohne.totalAreaM2 - 9 * 12)
    }
  })
})
