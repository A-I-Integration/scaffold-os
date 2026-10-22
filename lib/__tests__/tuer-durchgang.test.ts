import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBuildingFeatures, generateBillOfMaterials, feldEntlangFassade, DURCHGANG_ARTIKELNUMMER, type BuildingParams } from '../calculations/cad-engine'

const basis: BuildingParams = {
  lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach',
  floors: 3, floorHeightsM: [4, 4, 4], windowCount: 0, doorCount: 1, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
}

describe('Türen im Gerüst freihalten', () => {
  it('macht die Felder der untersten Lage vor der Tür zum Durchgang', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const tuer = generateBuildingFeatures(basis).find((f) => f.type === 'door')!
    const dg = m.fields.filter((f) => f.durchgang)
    expect(dg.length).toBeGreaterThan(0)
    for (const f of dg) {
      expect(f.levelIndex).toBe(0)
      expect(f.side).toBe(tuer.side)
      const a = feldEntlangFassade(f.side, f.positionX, f.positionZ, m.building)
      expect(Math.min(a + f.lengthM / 2, tuer.offsetAlongM + tuer.widthM / 2) - Math.max(a - f.lengthM / 2, tuer.offsetAlongM - tuer.widthM / 2)).toBeGreaterThan(0.02)
    }
    expect(m.warnings.some((w) => w.code === 'TUER_DURCHGANG')).toBe(true)
  })

  it('lässt in diesen Feldern Fuß-Querriegel und Diagonale weg und setzt einen Binder', () => {
    const m = generateCADModel(basis, 'layher-allround')
    for (const f of m.fields.filter((x) => x.durchgang)) {
      const teile = m.components3D.filter((c) => c.fieldId === f.id)
      expect(teile.some((c) => c.id === `rail-${f.id}-bottom`)).toBe(false)
      expect(teile.some((c) => c.type === 'diagonal')).toBe(false)
      expect(teile.filter((c) => c.articleNumber === DURCHGANG_ARTIKELNUMMER)).toHaveLength(1)
    }
    // andere Felder unverändert
    const normal = m.fields.find((x) => !x.durchgang && x.levelIndex === 0)!
    expect(m.components3D.some((c) => c.id === `rail-${normal.id}-bottom`)).toBe(true)
  })

  it('Stückliste: Binder zählt je Feld, Preis kommt aus dem Lager (0)', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const n = m.fields.filter((f) => f.durchgang).length
    const pos = generateBillOfMaterials(m).find((x) => x.articleNumber === DURCHGANG_ARTIKELNUMMER)!
    expect(pos.quantity).toBe(n)
    expect(pos.unitPrice).toBe(0)
  })

  it('mit tuerenFreihalten=false oder ohne Türen bleibt alles wie vorher', () => {
    const aus = generateCADModel({ ...basis, geruestOptionen: { tuerenFreihalten: false } }, 'layher-allround')
    expect(aus.fields.some((f) => f.durchgang)).toBe(false)
    const ohne = generateCADModel({ ...basis, doorCount: 0 }, 'layher-allround')
    expect(ohne.fields.some((f) => f.durchgang)).toBe(false)
    expect(ohne.components3D.some((c) => c.articleNumber === DURCHGANG_ARTIKELNUMMER)).toBe(false)
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
    expect(dg.every((f) => f.side === 'front' && f.levelIndex === 0)).toBe(true)
    for (const f of dg) {
      const a = feldEntlangFassade(f.side, f.positionX, f.positionZ, m.building)
      expect(Math.min(a + f.lengthM / 2, -3 + 0.6) - Math.max(a - f.lengthM / 2, -3 - 0.6)).toBeGreaterThan(0.02)
    }
    // Felder weit weg von x = -3 bleiben normal
    const fern = m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0 && Math.abs(feldEntlangFassade(f.side, f.positionX, f.positionZ, m.building) + 3) > 3.5)
    expect(fern.length).toBeGreaterThan(0)
    expect(fern.every((f) => !f.durchgang)).toBe(true)
  })
})

describe('Treppe und Türen', () => {
  const ohneTuer: BuildingParams = { ...basis, doorCount: 0 }
  // Die Treppe hat kein eigenes Feld-Merkmal: ihre Mitte (x) entspricht der Mitte des Treppenfelds (Vorderseite, Lage 0).
  const treppenFeld = (m: ReturnType<typeof generateCADModel>) => {
    const x = m.components3D.find((c) => c.id === 'stair-frame-0')!.position[0]
    return m.fields.find((f) => f.side === 'front' && f.levelIndex === 0 && Math.abs(f.positionX - x) < 0.02)!
  }

  it('die Treppe steht nicht vor einer Tür: sie weicht auf ein freies Feld aus', () => {
    const m0 = generateCADModel(ohneTuer, 'layher-allround')
    const f0 = treppenFeld(m0)
    const a = feldEntlangFassade(f0.side, f0.positionX, f0.positionZ, m0.building)
    // Tür genau dort, wo die Treppe sonst stünde
    const m1 = generateCADModel({ ...ohneTuer, tueren: [{ id: 't', side: 'front', offsetAlongM: a, widthM: 1, heightM: 2.1 }] }, 'layher-allround')
    const f1 = treppenFeld(m1)
    expect(f1.durchgang).toBeFalsy()
    expect(f1.positionX).not.toBeCloseTo(f0.positionX, 1)
    expect(m1.warnings.some((w) => w.code === 'TREPPE_VERSETZT')).toBe(true)
  })

  it('ohne Tür an der Treppenstelle bleibt die Treppe, wo sie war', () => {
    const m0 = generateCADModel(ohneTuer, 'layher-allround')
    const f0 = treppenFeld(m0)
    const a = feldEntlangFassade(f0.side, f0.positionX, f0.positionZ, m0.building)
    const m2 = generateCADModel({ ...ohneTuer, tueren: [{ id: 't', side: 'front', offsetAlongM: a + 6, widthM: 1, heightM: 2.1 }] }, 'layher-allround')
    expect(treppenFeld(m2).positionX).toBeCloseTo(f0.positionX, 3)
    expect(m2.warnings.some((w) => w.code === 'TREPPE_VERSETZT')).toBe(false)
  })
})
