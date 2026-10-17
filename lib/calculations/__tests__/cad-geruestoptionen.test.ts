import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../cad-engine'
import { ansichtAusProjektdaten } from '../../ansicht-link'
import { findeSystem } from '../geruest-systeme'
import { rechteckUmriss } from '../cad-umriss'

const basis: BuildingParams = {
  lengthM: 12, widthM: 9, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach',
  floors: 3, floorHeightsM: [2.7, 2.7, 2.6], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'],
}
const SYS = 'layher-allround'

describe('Gerüst-Einstellungen', () => {
  const sys = findeSystem(SYS)!

  it('ohne Einstellungen ändert sich nichts', () => {
    const a = generateCADModel(basis, SYS)
    const b = generateCADModel({ ...basis, geruestOptionen: {} }, SYS)
    expect(b.components3D.length).toBe(a.components3D.length)
    expect(b.fields.map((f) => f.lengthM)).toEqual(a.fields.map((f) => f.lengthM))
  })

  it('feste Feldlänge wird verwendet (alle Felder gleich lang, außer evtl. das Restfeld)', () => {
    const fl = sys.feldlangenM[0]
    const m = generateCADModel({ ...basis, geruestOptionen: { feldlaengeM: fl } }, SYS)
    const unten = m.fields.filter((f) => f.levelIndex === 0)
    expect(unten.slice(0, -1).every((f) => f.lengthM === fl)).toBe(true)
    expect(unten.every((f) => f.lengthM <= fl)).toBe(true)
  })

  it('ungültige Feldlänge/Breite: Warnung, Standard bleibt', () => {
    const m = generateCADModel({ ...basis, geruestOptionen: { feldlaengeM: 9.99, breiteM: 5 } }, SYS)
    expect(m.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['OPT_FELDLAENGE_UNGUELTIG', 'OPT_BREITE_UNGUELTIG']))
    expect(m.fields[0].widthM).toBe(0.73)
  })

  it('Gerüstbreite des Systems wird übernommen', () => {
    const breite = sys.rahmenBreitenM.find((b) => b !== 0.73)
    if (breite === undefined) return // System hat nur eine Breite
    const m = generateCADModel({ ...basis, geruestOptionen: { breiteM: breite } }, SYS)
    expect(m.fields[0].widthM).toBe(breite)
  })

  it('Wandabstand verschiebt das Gerüst; über 0,30 m gibt es eine Warnung', () => {
    const a = generateCADModel(basis, SYS).fields.find((f) => f.side === 'front')!
    const b = generateCADModel({ ...basis, geruestOptionen: { wandabstandM: 0.5 } }, SYS)
    expect(b.fields.find((f) => f.side === 'front')!.positionZ).toBeCloseTo(a.positionZ + 0.2, 6)
    expect(b.warnings.some((w) => w.code === 'WANDABSTAND_GROSS')).toBe(true)
    const c = generateCADModel({ ...basis, geruestOptionen: { wandabstandM: 0.2 } }, SYS)
    expect(c.warnings.some((w) => w.code === 'WANDABSTAND_GROSS')).toBe(false)
  })

  it('unsinniger Wandabstand wird abgelehnt', () => {
    for (const v of [0, -1, 5, NaN]) {
      const m = generateCADModel({ ...basis, geruestOptionen: { wandabstandM: v } }, SYS)
      expect(m.warnings.some((w) => w.code === 'OPT_WANDABSTAND_UNGUELTIG')).toBe(true)
    }
  })

  it('Treppe aus: keine Treppenteile', () => {
    expect(generateCADModel(basis, SYS).components3D.some((c) => c.type === 'stair')).toBe(true)
    expect(generateCADModel({ ...basis, geruestOptionen: { treppe: false } }, SYS).components3D.some((c) => c.type === 'stair' || c.id.startsWith('stair-'))).toBe(false)
  })

  it('gilt auch im Umriss-Modus', () => {
    const m = generateCADModel({ ...basis, umriss: rechteckUmriss(12, 9), geruestOptionen: { treppe: false, wandabstandM: 0.4 } }, SYS)
    expect(m.components3D.some((c) => c.type === 'stair')).toBe(false)
    expect(m.warnings.some((w) => w.code === 'WANDABSTAND_GROSS')).toBe(true)
  })
})

describe('3D-Link: Gerüst-Einstellungen', () => {
  it('übernimmt nur bekannte Zahlen/Werte', () => {
    const r = ansichtAusProjektdaten({ kiResult: { systemId: SYS, building: { lengthM: 10, widthM: 8, heightM: 8, geruestOptionen: { breiteM: 0.73, wandabstandM: 'x', treppe: false, preis: 5 } } } })
    expect(r?.building.geruestOptionen).toEqual({ breiteM: 0.73, treppe: false })
  })
})
