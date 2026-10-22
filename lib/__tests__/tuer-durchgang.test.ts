import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBuildingFeatures, generateBillOfMaterials, feldEntlangFassade, DURCHGANG_ARTIKELNUMMER, BINDER_UNTERKANTE_M, type BuildingParams, type CADModel } from '../calculations/cad-engine'

const basis: BuildingParams = {
  lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach',
  floors: 3, floorHeightsM: [4, 4, 4], windowCount: 0, doorCount: 1, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
}
type Tuer = NonNullable<BuildingParams['tueren']>[number]
const mitTuer = (t: Partial<Tuer> = {}, extra: Partial<BuildingParams> = {}): BuildingParams =>
  ({ ...basis, doorCount: 0, ...extra, tueren: [{ id: 't', side: 'front', offsetAlongM: 0, widthM: 1.0, heightM: 2.1, ...t }] })

/** Erwartete Anzahl freigehaltener Lagen: erste Lage, deren Oberkante minus Binder über der Türoberkante liegt. */
function erwarteteLagen(m: CADModel, hoehe: number): number {
  const n = Math.max(...m.levels.map((l) => l.index)) + 1
  let K = 1
  while (K < n && m.levels.find((l) => l.index === K - 1)!.topY - BINDER_UNTERKANTE_M < hoehe) K++
  return K
}
const along = (m: CADModel, f: CADModel['fields'][number]) => feldEntlangFassade(f.side, f.positionX, f.positionZ, m.building)

describe('Türen im Gerüst freihalten', () => {
  it('hält die Felder vor der Tür über so viele Lagen frei, dass der Binder oberhalb der Tür liegt', () => {
    const m = generateCADModel(mitTuer({ heightM: 3.5 }), 'layher-allround')
    const K = erwarteteLagen(m, 3.5)
    expect(K).toBeGreaterThanOrEqual(2)
    const dg = m.fields.filter((f) => f.durchgang)
    expect(dg.length).toBeGreaterThan(0)
    for (const f of dg) {
      expect(f.side).toBe('front')
      expect(f.levelIndex).toBeLessThan(K)
      expect(!!f.durchgangOben).toBe(f.levelIndex === K - 1)
      expect(!!f.durchgangOffen).toBe(f.levelIndex < K - 1)
      const a = along(m, f)
      expect(Math.min(a + f.lengthM / 2, 0.5) - Math.max(a - f.lengthM / 2, -0.5)).toBeGreaterThan(0.02)
    }
    expect(new Set(dg.map((f) => f.levelIndex)).size).toBe(K)
    expect(m.warnings.some((w) => w.code === 'TUER_DURCHGANG')).toBe(true)
  })

  it('in der Türöffnung steht keine Stange, kein Netz und keine Plane', () => {
    for (const hoehe of [2.1, 3.5]) {
      const m = generateCADModel(mitTuer({ widthM: 2, heightM: hoehe }, { geruestOptionen: { kederplane: { vonM: 0, bisM: 12 } } }), 'layher-allround')
      const dg = new Set(m.fields.filter((f) => f.durchgang).map((f) => f.id))
      const verboten = m.components3D.filter((c) =>
        c.fieldId && dg.has(c.fieldId) && c.articleNumber !== DURCHGANG_ARTIKELNUMMER &&
        ['frame', 'footplate', 'diagonal', 'net', 'safety_net', 'sheeting', 'ladder', 'coupling'].includes(c.type) &&
        !/^rail-.*-top$/.test(c.id) && Math.abs(c.position[0]) < 1.0 - 0.05)
      expect(verboten.map((c) => `${c.id}@${c.position[0].toFixed(2)}`)).toEqual([])
    }
  })

  it('der Binder sitzt über der Tür: Unterkante ≥ Türhöhe, ein Stück je Feld der obersten freien Lage', () => {
    const m = generateCADModel(mitTuer({ heightM: 3.5 }), 'layher-allround')
    const oben = m.fields.filter((f) => f.durchgangOben)
    const binder = m.components3D.filter((c) => c.articleNumber === DURCHGANG_ARTIKELNUMMER)
    expect(binder).toHaveLength(oben.length)
    for (const b of binder) expect(b.position[1] - b.scale[1] / 2).toBeGreaterThanOrEqual(3.5 - 0.01)
    const pos = generateBillOfMaterials(m).find((x) => x.articleNumber === DURCHGANG_ARTIKELNUMMER)!
    expect(pos.quantity).toBe(oben.length)
    expect(pos.unitPrice).toBe(0) // Preis kommt aus dem Lager
  })

  it('unterhalb des Binders entfallen Belag, Geländer und Bordbrett; darüber bleibt alles', () => {
    const m = generateCADModel(mitTuer({ heightM: 3.5 }), 'layher-allround')
    for (const f of m.fields.filter((x) => x.durchgangOffen)) {
      expect(m.components3D.some((c) => c.fieldId === f.id && (c.type === 'deck' || c.type === 'railing' || c.type === 'board'))).toBe(false)
    }
    for (const f of m.fields.filter((x) => x.durchgangOben)) {
      expect(m.components3D.some((c) => c.fieldId === f.id && c.type === 'deck')).toBe(true)
    }
    const K = erwarteteLagen(m, 3.5)
    const darueber = m.fields.filter((f) => f.side === 'front' && f.levelIndex === K)
    expect(darueber.length).toBeGreaterThan(0)
    for (const f of darueber) expect(m.components3D.some((c) => c.fieldId === f.id && c.type === 'deck')).toBe(true)
  })

  it('die Randfelder links und rechts der Öffnung sind verstärkt', () => {
    const m = generateCADModel(mitTuer({ heightM: 3.5 }), 'layher-allround')
    const K = erwarteteLagen(m, 3.5)
    const vf = m.fields.filter((f) => f.verstaerkt)
    expect(vf.length).toBeGreaterThan(0)
    // je Lage ein Randfeld pro Seite der Öffnung
    for (let L = 0; L < K; L++) {
      const aufLage = vf.filter((f) => f.levelIndex === L)
      expect(aufLage.some((f) => f.verstaerkt!.plus)).toBe(true) // Feld links der Öffnung
      expect(aufLage.some((f) => f.verstaerkt!.minus)).toBe(true) // Feld rechts der Öffnung
    }
    for (const f of vf) {
      expect(f.durchgang).toBeFalsy()
      expect(m.components3D.some((c) => c.id === `diagonal-${f.id}-verst`)).toBe(true)
      if (f.verstaerkt!.plus) expect(m.components3D.some((c) => c.id === `frame-${f.id}-verst-plus`)).toBe(true)
      if (f.verstaerkt!.minus) expect(m.components3D.some((c) => c.id === `frame-${f.id}-verst-minus`)).toBe(true)
    }
    // Felder oberhalb und weit weg sind nicht verstärkt
    expect(m.fields.filter((f) => f.levelIndex >= K).every((f) => !f.verstaerkt)).toBe(true)
  })

  it('mit tuerenFreihalten=false oder ohne Türen bleibt alles wie vorher', () => {
    const aus = generateCADModel({ ...mitTuer(), geruestOptionen: { tuerenFreihalten: false } }, 'layher-allround')
    expect(aus.fields.some((f) => f.durchgang || f.verstaerkt)).toBe(false)
    const ohne = generateCADModel({ ...basis, doorCount: 0 }, 'layher-allround')
    expect(ohne.fields.some((f) => f.durchgang || f.verstaerkt)).toBe(false)
    expect(ohne.components3D.some((c) => c.articleNumber === DURCHGANG_ARTIKELNUMMER || c.id.includes('-verst'))).toBe(false)
  })

  it('sehr hohe Tür: Warnung, dass viele Lagen freigehalten werden', () => {
    const m = generateCADModel(mitTuer({ heightM: 6.5 }), 'layher-allround')
    expect(m.warnings.some((w) => w.code === 'TUER_LAGEN')).toBe(true)
    const normal = generateCADModel(mitTuer({ heightM: 2.1 }), 'layher-allround')
    expect(normal.warnings.some((w) => w.code === 'TUER_LAGEN')).toBe(false)
  })
})

describe('Türen einzeln planen', () => {
  const mitTueren: BuildingParams = {
    ...basis, doorCount: 5,
    tueren: [
      { id: 'a', side: 'front', offsetAlongM: -3, widthM: 1.2, heightM: 2.2 },
      { id: 'b', side: 'left', offsetAlongM: 1, widthM: 0.9, heightM: 2.1 },
    ],
  }

  it('ersetzt die gleichmäßig verteilten Türen und nimmt die Maße 1:1', () => {
    const t = generateBuildingFeatures(mitTueren).filter((f) => f.type === 'door')
    expect(t).toHaveLength(2)
    expect(t[0]).toMatchObject({ side: 'front', offsetAlongM: -3, widthM: 1.2, heightM: 2.2, bottomY: 0, floorIndex: 0 })
    expect(t[1]).toMatchObject({ side: 'left', offsetAlongM: 1, widthM: 0.9 })
  })

  it('ohne Einträge gilt weiter doorCount', () => {
    expect(generateBuildingFeatures({ ...mitTueren, tueren: undefined }).filter((f) => f.type === 'door')).toHaveLength(5)
    expect(generateBuildingFeatures({ ...mitTueren, tueren: [] }).filter((f) => f.type === 'door')).toHaveLength(5)
  })

  it('der Durchgang liegt vor der angegebenen Tür und nur dort', () => {
    const m = generateCADModel({ ...mitTueren, tueren: [mitTueren.tueren![0]] }, 'layher-allround')
    const dg = m.fields.filter((f) => f.durchgang)
    expect(dg.length).toBeGreaterThan(0)
    expect(dg.every((f) => f.side === 'front')).toBe(true)
    for (const f of dg) {
      const a = along(m, f)
      expect(Math.min(a + f.lengthM / 2, -3 + 0.6) - Math.max(a - f.lengthM / 2, -3 - 0.6)).toBeGreaterThan(0.02)
    }
    const fern = m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0 && Math.abs(along(m, f) + 3) > 3.5)
    expect(fern.length).toBeGreaterThan(0)
    expect(fern.every((f) => !f.durchgang)).toBe(true)
  })
})

describe('Treppe und Türen', () => {
  const ohneTuer: BuildingParams = { ...basis, doorCount: 0 }
  // Die Treppe hat kein eigenes Feld-Merkmal: ihre Mitte (x) entspricht der Mitte des Treppenfelds (Vorderseite, Lage 0).
  const treppenFeld = (m: CADModel) => {
    const x = m.components3D.find((c) => c.id === 'stair-frame-0')!.position[0]
    return m.fields.find((f) => f.side === 'front' && f.levelIndex === 0 && Math.abs(f.positionX - x) < 0.02)!
  }

  it('die Treppe steht nicht vor einer Tür: sie weicht auf ein freies Feld aus', () => {
    const m0 = generateCADModel(ohneTuer, 'layher-allround')
    const f0 = treppenFeld(m0)
    const m1 = generateCADModel({ ...ohneTuer, tueren: [{ id: 't', side: 'front', offsetAlongM: along(m0, f0), widthM: 1, heightM: 2.1 }] }, 'layher-allround')
    const f1 = treppenFeld(m1)
    expect(f1.durchgang).toBeFalsy()
    expect(f1.positionX).not.toBeCloseTo(f0.positionX, 1)
    expect(m1.warnings.some((w) => w.code === 'TREPPE_VERSETZT')).toBe(true)
  })

  it('ohne Tür an der Treppenstelle bleibt die Treppe, wo sie war', () => {
    const m0 = generateCADModel(ohneTuer, 'layher-allround')
    const f0 = treppenFeld(m0)
    const m2 = generateCADModel({ ...ohneTuer, tueren: [{ id: 't', side: 'front', offsetAlongM: along(m0, f0) + 6, widthM: 1, heightM: 2.1 }] }, 'layher-allround')
    expect(treppenFeld(m2).positionX).toBeCloseTo(f0.positionX, 3)
    expect(m2.warnings.some((w) => w.code === 'TREPPE_VERSETZT')).toBe(false)
  })
})

describe('Gestuftes Gebäude (Turm + Anbau) mit Tür in der Mitte', () => {
  const turm: BuildingParams = {
    ...basis, lengthM: 20, widthM: 9, heightM: 32, eavesHeightM: 11, floors: 8, floorHeightsM: Array(8).fill(4), doorCount: 0,
    sections: [{ laengeM: 9, hoeheM: 32 }, { laengeM: 11, hoeheM: 11 }],
    tueren: [{ id: 'a', side: 'front', offsetAlongM: 0, widthM: 2.1, heightM: 3.5 }],
  }

  it('in der Türöffnung stehen weder Rahmen noch Fußplatten noch Diagonalen', () => {
    const m = generateCADModel(turm, 'layher-allround')
    expect(m.fields.some((f) => f.durchgang)).toBe(true)
    const dg = new Set(m.fields.filter((f) => f.durchgang).map((f) => f.id))
    const drin = m.components3D.filter((c) => c.fieldId && dg.has(c.fieldId) && c.articleNumber !== DURCHGANG_ARTIKELNUMMER && ['frame', 'footplate', 'diagonal'].includes(c.type) && !/^rail-.*-top$/.test(c.id) && Math.abs(c.position[0]) < 1.0)
    expect(drin.map((c) => `${c.id}@${c.position[0].toFixed(2)}`)).toEqual([])
  })

  it('die Treppe führt trotz Tür über alle Lagen', () => {
    const m = generateCADModel(turm, 'layher-allround')
    const treppe = m.components3D.find((c) => c.id === 'stair-frame-0')!
    expect(treppe).toBeDefined()
    const lagenGes = Math.max(...m.fields.filter((f) => f.side === 'front').map((f) => f.levelIndex)) + 1
    expect(treppe.flights).toBe(lagenGes)
  })
})

describe('Tür mit Aufschlag nach außen', () => {
  const tuer = (extra: Partial<Tuer>) => mitTuer({ ...extra })
  const lage0 = (m: CADModel) => m.fields.filter((x) => x.durchgang && x.levelIndex === 0)

  it('nach außen: der Freiraum wächst um die Flügelweite auf der Anschlagseite', () => {
    const innen = lage0(generateCADModel(tuer({ aufschlag: 'innen', widthM: 2 }), 'layher-allround'))
    const minus = lage0(generateCADModel(tuer({ aufschlag: 'aussen', widthM: 2, fluegel: 1, anschlag: 'minus' }), 'layher-allround'))
    const plus = lage0(generateCADModel(tuer({ aufschlag: 'aussen', widthM: 2, fluegel: 1, anschlag: 'plus' }), 'layher-allround'))
    expect(minus.length).toBeGreaterThanOrEqual(innen.length)
    expect(plus.length).toBeGreaterThanOrEqual(innen.length)
    const mitte = (arr: typeof minus) => arr.reduce((s, x) => s + x.positionX, 0) / arr.length
    expect(mitte(minus)).toBeLessThan(mitte(plus)) // Minus-Anschlag: freier Bereich weiter links, Plus: weiter rechts
    expect(generateCADModel(tuer({ aufschlag: 'aussen' }), 'layher-allround').warnings.some((w) => w.code === 'TUER_AUFSCHLAG')).toBe(true)
  })
})

describe('Feldanordnung', () => {
  it('die Felder einer Seite liegen lückenlos und überlappungsfrei nebeneinander', () => {
    for (const laenge of [10, 13.37, 21.2]) {
      const m = generateCADModel({ ...basis, lengthM: laenge, doorCount: 0 }, 'layher-allround')
      const vorn = m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0).sort((a, b) => a.positionX - b.positionX)
      expect(vorn.length).toBeGreaterThan(1)
      expect(vorn[0].positionX - vorn[0].lengthM / 2).toBeCloseTo(-laenge / 2, 2)
      for (let i = 1; i < vorn.length; i++) expect(vorn[i].positionX - vorn[i].lengthM / 2).toBeCloseTo(vorn[i - 1].positionX + vorn[i - 1].lengthM / 2, 2)
      const ende = vorn[vorn.length - 1]
      expect(ende.positionX + ende.lengthM / 2).toBeCloseTo(laenge / 2, 2)
    }
  })
})
