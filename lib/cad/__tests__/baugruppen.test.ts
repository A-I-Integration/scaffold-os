import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, aussentreppeInReihe, treppenlaufInFeld, type BuildingParams } from '@/lib/calculations/cad-engine'
import { leiteBaugruppenAb, teileDerBaugruppe, stueckzahlJeArtikel, pruefeTreppenBaugruppen } from '@/lib/cad/baugruppen'

const haus = (extra: Partial<BuildingParams> = {}): BuildingParams => ({ lengthM: 20, widthM: 10, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach', floors: 4, floorHeightsM: [3, 3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], ...extra })

describe('Treppe als Baugruppe (automatische Außentreppe)', () => {
  const m = generateCADModel(haus(), 'layher-allround')
  const g = leiteBaugruppenAb(m.components3D)

  it('genau eine Treppen-Baugruppe mit Laufbauteil, Stufen, Podesten, Geländer', () => {
    expect(g).toHaveLength(1)
    expect(g[0].art).toBe('treppe')
    expect(g[0].id).toBe('treppe-auto')
    expect(g[0].memberIds).toContain('stair-frame-0')
    const z = stueckzahlJeArtikel(m.components3D, 'treppe-auto')
    expect(z['SP-001']).toBe(1)
    expect(z['ST-001']).toBeGreaterThan(0)
    expect(z['ST-002']).toBe(m.components3D.find((c) => c.id === 'stair-frame-0')!.flights)
  })
  it('alle Teile mit Präfix stair- gehören zur Baugruppe, kein anderes Teil', () => {
    const mit = m.components3D.filter((c) => c.assemblyId === 'treppe-auto').map((c) => c.id).sort()
    const praefix = m.components3D.filter((c) => c.id.startsWith('stair-')).map((c) => c.id).sort()
    expect(mit).toEqual(praefix)
  })
  it('Prüfung meldet nichts', () => { expect(pruefeTreppenBaugruppen(m.components3D)).toEqual([]) })
  it('Klick auf eine Stufe liefert die ganze Treppe, ein Rahmen nur sich selbst', () => {
    const stufe = m.components3D.find((c) => c.id.startsWith('stair-step-'))!
    expect(teileDerBaugruppe(m.components3D, stufe.id).length).toBe(g[0].memberIds.length)
    const rahmen = m.components3D.find((c) => c.type === 'frame')!
    expect(teileDerBaugruppe(m.components3D, rahmen.id)).toEqual([rahmen.id])
  })
  it('Stückliste ist von der Zuordnung unabhängig (Gleichwertigkeit)', () => {
    const ohne = { ...m, components3D: m.components3D.map(({ assemblyId, ...rest }) => rest) }
    expect(generateBillOfMaterials(m)).toEqual(generateBillOfMaterials(ohne as typeof m))
  })
  it('ohne Treppe keine Baugruppe', () => {
    const o = generateCADModel(haus({ geruestOptionen: { treppe: false } } as Partial<BuildingParams>), 'layher-allround')
    expect(leiteBaugruppenAb(o.components3D)).toEqual([])
  })
})

describe('Treppe von Hand', () => {
  const m = generateCADModel(haus({ geruestOptionen: { treppe: false } } as Partial<BuildingParams>), 'layher-allround')
  it('Treppenlauf im Feld bildet eine Baugruppe unter der Lauf-Id', () => {
    const f = m.fields[0]
    const lv = m.levels.find((l) => l.index === f.levelIndex)!
    const teile = treppenlaufInFeld(m, f, lv, 'manual-stair-1')
    const g = leiteBaugruppenAb(teile)
    expect(g).toHaveLength(1)
    expect(g[0].id).toBe('manual-stair-1')
    expect(g[0].memberIds).toContain('manual-stair-1')
    expect(pruefeTreppenBaugruppen(teile)).toEqual([])
  })
  it('Außentreppe in der Reihe: eigene Baugruppe, Laufbauteil trägt die Id', () => {
    const f = m.fields.find((x) => x.side === 'front' && x.levelIndex === 0)!
    const liste = aussentreppeInReihe(m, f, 'manual-stair-2')
    const g = leiteBaugruppenAb(liste).find((x) => x.id === 'manual-stair-2')!
    expect(g.art).toBe('treppe')
    expect(g.memberIds).toContain('manual-stair-2')
    expect(pruefeTreppenBaugruppen(liste)).toEqual([])
  })
})

describe('Prüfung erkennt Lücken', () => {
  const t = (id: string, type: string, art: string, extra = {}) => ({ id, type, articleNumber: art, assemblyId: 'x', ...extra }) as never
  it('ohne Lauf', () => { expect(pruefeTreppenBaugruppen([t('a', 'deck', 'ST-001')])).toEqual([]) }) // ohne Laufbauteil ist es keine Treppe
  it('ohne Stufen', () => { expect(pruefeTreppenBaugruppen([t('l', 'stair', 'SP-001')]).map((h) => h.code)).toEqual(['TREPPE_OHNE_STUFEN']) })
  it('falsche Podestzahl', () => {
    const h = pruefeTreppenBaugruppen([t('l', 'stair', 'SP-001', { flights: 3 }), t('s', 'deck', 'ST-001'), t('p', 'deck', 'ST-002')])
    expect(h.map((x) => x.code)).toEqual(['TREPPE_PODESTE'])
  })
})
