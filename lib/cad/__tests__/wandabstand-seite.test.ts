import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const HAUS: BuildingParams = { lengthM: 12, widthM: 8, heightM: 6, eavesHeightM: 6, roofForm: 'flachdach', overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'] } as BuildingParams
const SYS = 'layher-allround'
const mit = (o: NonNullable<BuildingParams['geruestOptionen']>): BuildingParams => ({ ...HAUS, geruestOptionen: o })
const rahmen = (m: ReturnType<typeof generateCADModel>, side: string) => m.fields.filter((f) => f.side === side && f.levelIndex === 0)

describe('Wandabstand je Seite im Generator', () => {
  it('Ohne Seitenwerte exakt wie bisher; alle vier Seiten gleich = gemeinsamer Wert (gleiches Modell)', () => {
    const a = generateCADModel(mit({ wandabstandM: 0.4 }), SYS)
    const b = generateCADModel(mit({ wandabstandM: 0.4, wandabstandSeiteM: { front: 0.4, back: 0.4, left: 0.4, right: 0.4 } }), SYS)
    expect(JSON.stringify(b.components3D)).toBe(JSON.stringify(a.components3D))
    expect(JSON.stringify(b.fields)).toBe(JSON.stringify(a.fields))
    expect(b.anchors).toEqual(a.anchors)
  })
  it('leeres Seitenobjekt ändert nichts', () => {
    const a = generateCADModel(HAUS, SYS)
    const b = generateCADModel(mit({ wandabstandSeiteM: {} }), SYS)
    expect(JSON.stringify(b.components3D)).toBe(JSON.stringify(a.components3D))
  })
  it('hinten 0,45 m: nur die hinteren Felder rücken um 0,15 m nach außen, die anderen Seiten bleiben', () => {
    const a = generateCADModel(HAUS, SYS)
    const b = generateCADModel(mit({ wandabstandSeiteM: { back: 0.45 } }), SYS)
    for (const sd of ['front', 'left', 'right']) {
      expect(rahmen(a, sd).length).toBeGreaterThan(0)
      expect(rahmen(b, sd).map((f) => [f.positionX, f.positionZ])).toEqual(rahmen(a, sd).map((f) => [f.positionX, f.positionZ]))
    }
    const za = rahmen(a, 'back').map((f) => f.positionZ), zb = rahmen(b, 'back').map((f) => f.positionZ)
    expect(zb.length).toBe(za.length)
    zb.forEach((z, i) => expect(za[i] - z).toBeCloseTo(0.15, 9))
    // Ecken folgen den Feldern: es gibt weiterhin Eckbeläge hinten
    expect(b.components3D.some((c) => c.id.startsWith('corner-back-left-0-deck'))).toBe(true)
    // Anker hinten sitzen im neuen Abstand
    const ankerA = a.anchors.filter((k) => k.side === 'back'), ankerB = b.anchors.filter((k) => k.side === 'back')
    expect(ankerB.length).toBe(ankerA.length)
    ankerB.forEach((k, i) => expect(ankerA[i].positionZ - k.positionZ).toBeCloseTo(0.15, 9))
  })
  it('links 0,5 m, rechts 0,2 m: Felder links weiter links, rechts näher an der Wand', () => {
    const a = generateCADModel(HAUS, SYS)
    const b = generateCADModel(mit({ wandabstandSeiteM: { left: 0.5, right: 0.2 } }), SYS)
    expect(rahmen(a, 'left')[0].positionX - rahmen(b, 'left')[0].positionX).toBeCloseTo(0.2, 9)
    expect(rahmen(b, 'right')[0].positionX - rahmen(a, 'right')[0].positionX).toBeCloseTo(-0.1, 9)
  })
  it('ungültiger Seitenwert: Warnung, es gilt der gemeinsame Wert', () => {
    const a = generateCADModel(HAUS, SYS)
    const b = generateCADModel(mit({ wandabstandSeiteM: { front: 5 } }), SYS)
    expect(b.warnings.some((w) => w.code === 'OPT_WANDABSTAND_UNGUELTIG')).toBe(true)
    expect(JSON.stringify(b.components3D)).toBe(JSON.stringify(a.components3D))
  })
  it('großer Seitenwert über der Hinweisgrenze: Warnung', () => {
    const b = generateCADModel(mit({ wandabstandSeiteM: { front: 0.55 } }), SYS)
    expect(b.warnings.some((w) => w.code === 'WANDABSTAND_GROSS')).toBe(true)
  })
  it('Umriss-Modus: Hinweis, dass der Seitenwert dort nicht gilt', () => {
    const umriss = [{ x: -6, z: -8.5 }, { x: 6, z: -8.5 }, { x: 6, z: -0.5 }, { x: -6, z: -0.5 }]
    const b = generateCADModel({ ...HAUS, umriss, geruestOptionen: { wandabstandSeiteM: { front: 0.4 } } } as BuildingParams, SYS)
    expect(b.warnings.some((w) => w.code === 'WANDABSTAND_SEITE_UMRISS')).toBe(true)
  })
  it('Abgestuftes Gebäude: vier gleiche Seitenwerte = gemeinsamer Wert; vorne 0,5 m rückt nur vorne', () => {
    const gestuft: BuildingParams = { ...HAUS, lengthM: 18, sections: [{ laengeM: 10, hoeheM: 6 }, { laengeM: 8, hoeheM: 9 }] } as BuildingParams
    const a = generateCADModel({ ...gestuft, geruestOptionen: { wandabstandM: 0.3 } }, SYS)
    const b = generateCADModel({ ...gestuft, geruestOptionen: { wandabstandM: 0.3, wandabstandSeiteM: { front: 0.3, back: 0.3, left: 0.3, right: 0.3 } } }, SYS)
    expect(JSON.stringify(b.components3D)).toBe(JSON.stringify(a.components3D))
    const c = generateCADModel({ ...gestuft, geruestOptionen: { wandabstandM: 0.3, wandabstandSeiteM: { front: 0.5 } } }, SYS)
    const vorneA = a.fields.filter((f) => f.side === 'front' && f.levelIndex === 0), vorneC = c.fields.filter((f) => f.side === 'front' && f.levelIndex === 0)
    expect(vorneC.length).toBe(vorneA.length)
    vorneC.forEach((f, i) => expect(f.positionZ - vorneA[i].positionZ).toBeCloseTo(0.2, 9))
    const hintenA = a.fields.filter((f) => f.side === 'back' && f.levelIndex === 0), hintenC = c.fields.filter((f) => f.side === 'back' && f.levelIndex === 0)
    hintenC.forEach((f, i) => expect(f.positionZ).toBeCloseTo(hintenA[i].positionZ, 9))
  })
})
