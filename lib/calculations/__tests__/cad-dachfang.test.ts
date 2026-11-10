import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, type BuildingParams } from '../cad-engine'

const sattel: BuildingParams = {
  lengthM: 12, widthM: 9, heightM: 9, eavesHeightM: 6.5, roofHeightM: 2.5, roofForm: 'satteldach',
  floors: 2, floorHeightsM: [3.25, 3.25], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
}
const SYS = 'layher-allround'
const dachfang = (m: ReturnType<typeof generateCADModel>) => m.components3D.filter((c) => c.articleNumber === 'DF-001')

describe('Dachfangwand', () => {
  it('ohne Einstellung gibt es keine Dachfangwand', () => {
    expect(dachfang(generateCADModel(sattel, SYS)).length).toBe(0)
  })

  it('Satteldach: nur an den Traufseiten (parallel zum First), nur oberste Lage', () => {
    const m = generateCADModel({ ...sattel, geruestOptionen: { dachfang: { hoeheM: 1 } } }, SYS)
    const df = dachfang(m)
    expect(df.length).toBeGreaterThan(0)
    for (const c of df) {
      const f = m.fields.find((x) => x.id === c.fieldId)!
      const obenDieserSeite = Math.max(...m.fields.filter((x) => x.side === f.side).map((x) => x.levelIndex))
      expect(f.levelIndex).toBe(obenDieserSeite)
      expect(['front', 'back']).toContain(f.side) // Länge 12 ≥ Breite 9: First läuft entlang der Länge
      expect(c.scale[1]).toBe(1)
    }
  })

  it('Satteldach mit längerer Breite: Traufe an links/rechts', () => {
    const m = generateCADModel({ ...sattel, lengthM: 8, widthM: 12, geruestOptionen: { dachfang: { hoeheM: 1 } } }, SYS)
    const seiten = new Set(dachfang(m).map((c) => m.fields.find((x) => x.id === c.fieldId)!.side))
    expect([...seiten].every((s) => s === 'left' || s === 'right')).toBe(true)
  })

  it('Walmdach: alle Seiten', () => {
    const m = generateCADModel({ ...sattel, roofForm: 'walmdach', geruestOptionen: { dachfang: { hoeheM: 1 } } }, SYS)
    const seiten = new Set(dachfang(m).map((c) => m.fields.find((x) => x.id === c.fieldId)!.side))
    expect(seiten.size).toBe(4)
  })

  it('Schwelle: unter der eingestellten Traufhöhe keine Wand', () => {
    const m = generateCADModel({ ...sattel, geruestOptionen: { dachfang: { hoeheM: 1, abTraufeM: 7 } } }, SYS)
    expect(dachfang(m).length).toBe(0)
    const m2 = generateCADModel({ ...sattel, geruestOptionen: { dachfang: { hoeheM: 1, abTraufeM: 6 } } }, SYS)
    expect(dachfang(m2).length).toBeGreaterThan(0)
  })

  it('Flachdach: keine Wand, aber Hinweis', () => {
    const m = generateCADModel({ ...sattel, roofForm: 'flachdach', geruestOptionen: { dachfang: { hoeheM: 1 } } }, SYS)
    expect(dachfang(m).length).toBe(0)
    expect(m.warnings.map((w) => w.code)).toContain('DACHFANG_DACHFORM')
  })

  it('Stückliste: Fläche in m², kein Fantasiepreis', () => {
    const m = generateCADModel({ ...sattel, geruestOptionen: { dachfang: { hoeheM: 1 } } }, SYS)
    const pos = generateBillOfMaterials(m).find((p) => p.articleNumber === 'DF-001')
    expect(pos).toBeDefined()
    expect(pos!.unit).toBe('m²')
    expect(pos!.unitPrice).toBe(0)
  })
})
