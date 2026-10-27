import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, calculateLogistics, type BuildingParams } from '../calculations/cad-engine'
import { erzeugeLeistungsverzeichnis, LV_STANDARD_EINGABEN } from '../leistungsverzeichnis'

const basis: BuildingParams = {
  lengthM: 10, widthM: 8, heightM: 20, eavesHeightM: 20, roofHeightM: 0, roofForm: 'flachdach',
  floors: 6, floorHeightsM: [3.33, 3.33, 3.33, 3.33, 3.34, 3.34], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
}

describe('Kederplane', () => {
  it('bekleidet nur ganze Lagen im Höhenbereich, an allen Seiten', () => {
    const ohne = generateCADModel(basis, 'layher-allround')
    expect(ohne.components3D.some((c) => c.type === 'sheeting')).toBe(false)
    const m = generateCADModel({ ...basis, geruestOptionen: { kederplane: { vonM: 10, bisM: 20 } } }, 'layher-allround')
    const planen = m.components3D.filter((c) => c.type === 'sheeting')
    expect(planen.length).toBeGreaterThan(0)
    // Lagen 2 m: 10–20 m = 5 Lagen
    const lagen = new Set(planen.map((c) => m.levels.find((l) => l.id === c.levelId)!.index))
    expect(lagen.size).toBe(5)
    for (const c of planen) {
      const lv = m.levels.find((l) => l.id === c.levelId)!
      expect(lv.bottomY).toBeGreaterThanOrEqual(10 - 0.01)
      expect(lv.topY).toBeLessThanOrEqual(20 + 0.01)
      expect(c.scale[1]).toBeCloseTo(lv.heightM, 2)
    }
    // alle vier Seiten
    const felderMitPlane = new Set(planen.map((c) => m.fields.find((f) => f.id === c.fieldId)!.side))
    expect(felderMitPlane.size).toBe(4)
    // Stückliste: Preis kommt aus dem Lager, nicht erfunden
    const pos = generateBillOfMaterials(m).find((x) => x.articleNumber === 'KP-001')!
    expect(pos.quantity).toBe(planen.length)
    expect(pos.unitPrice).toBe(0)
  })

  it('ohne gültigen Bereich keine Plane', () => {
    const m = generateCADModel({ ...basis, geruestOptionen: { kederplane: { vonM: 15, bisM: 10 } } }, 'layher-allround')
    expect(m.components3D.some((c) => c.type === 'sheeting')).toBe(false)
  })
})

describe('Aufzug', () => {
  const mit = (az: NonNullable<BuildingParams['geruestOptionen']>['aufzug']) => generateCADModel({ ...basis, geruestOptionen: { aufzug: az } }, 'layher-allround')

  it('steht außen vor dem Gerüst an der gewählten Seite, ein einziger', () => {
    const m = mit({ seite: 'front', gemietet: false })
    const a = m.components3D.filter((c) => c.type === 'elevator')
    expect(a).toHaveLength(1)
    const feld = m.fields.find((f) => f.id === a[0].fieldId)!
    expect(feld.side).toBe('front')
    // Höhe = oberste Lage
    expect(a[0].scale[1]).toBeCloseTo(Math.max(...m.levels.map((l) => l.topY)), 2)
    // vorne = +z: der Schacht liegt weiter außen als das Gerüst
    expect(a[0].position[2]).toBeGreaterThan(feld.positionZ + feld.widthM / 2)
  })

  it('Förderhöhe bis begrenzt den Schacht', () => {
    const a = mit({ seite: 'left', bisM: 12, gemietet: true }).components3D.find((c) => c.type === 'elevator')!
    expect(a.scale[1]).toBe(12)
  })

  it('gemietet: nicht in der Stückliste; eigenes Inventar: in der Stückliste ohne Fantasiepreis', () => {
    const gemietet = generateBillOfMaterials(mit({ seite: 'front', gemietet: true }))
    expect(gemietet.find((x) => x.articleNumber === 'AZ-001')).toBeUndefined()
    const eigen = generateBillOfMaterials(mit({ seite: 'front', gemietet: false }))
    const pos = eigen.find((x) => x.articleNumber === 'AZ-001')!
    expect(pos.quantity).toBe(1)
    expect(pos.unitPrice).toBe(0)
  })

  it('Kosten von Hand gehen ins LV (Statiker-Stil und Zusatzleistung), Haltestellen aus dem Modell', () => {
    const model = mit({ seite: 'front', gemietet: true, haltestellen: 7, kostenAufbauEur: 1200, kostenVorhaltungJeWocheEur: 300, kostenAbbauEur: 800 })
    const materials = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
    const log = calculateLogistics(model, materials, 0.2)
    const q = { model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }
    const e = { ...LV_STANDARD_EINGABEN, gesamtStandzeitWochen: 10, stundensatzFach: 50, stundensatzHelfer: 40, mietsatzProzentJeWoche: 1, statikPauschale: 1000 }

    const st = erzeugeLeistungsverzeichnis(q, { ...e, stil: 'statiker' })
    const pos = st.titel[1].positionen
    const az = pos.find((p) => p.titel.startsWith('Personen- und Lastenaufzug 500/800kg 1.BA'))!
    expect(az.ep).toBe(2000)
    expect(pos.find((p) => p.titel === `Vorhaltung zur Vorposition ${az.nr}`)!.ep).toBe(300)
    expect(pos.find((p) => p.titel === 'Haltestellenausstattung 1. BA')!.menge).toBe(7)

    const get = erzeugeLeistungsverzeichnis(q, { ...e, stil: 'getrennt' })
    const all = get.titel[1].positionen
    expect(all.find((p) => p.titel.endsWith('aufzug – Aufbau'))!.ep).toBe(1200)
    expect(all.find((p) => p.titel.endsWith('aufzug – Abbau'))!.ep).toBe(800)
    expect(all.find((p) => p.titel === 'Vorhaltung Personen- und Lastenaufzug')!.ep).toBe(300)
  })

  it('Kederplane-Menge erscheint im Statiker-LV', () => {
    const model = generateCADModel({ ...basis, geruestOptionen: { kederplane: { vonM: 10, bisM: 20 } } }, 'layher-allround')
    const materials = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
    const log = calculateLogistics(model, materials, 0.2)
    const lv = erzeugeLeistungsverzeichnis({ model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }, { ...LV_STANDARD_EINGABEN, stil: 'statiker' })
    const k = lv.titel[1].positionen.find((p) => p.titel.startsWith('Vertikale Bekleidung der Gerüste 1. BA'))!
    expect(k.text.join(' ')).toMatch(/Aus dem CAD: [\d.,]+ m² Plane/)
  })
})

describe('Kederplane: keine Mehrfachzählung', () => {
  it('jedes Feld hat genau eine Plane, Fläche entspricht der Fassade', () => {
    const b: BuildingParams = { ...basis, lengthM: 9.15, widthM: 9.15, heightM: 31, eavesHeightM: 31, floors: 1, floorHeightsM: [31] }
    const m = generateCADModel({ ...b, geruestOptionen: { kederplane: { vonM: 0, bisM: 31 } } }, 'layher-allround')
    const planen = m.components3D.filter((c) => c.type === 'sheeting')
    expect(new Set(planen.map((c) => c.fieldId)).size).toBe(planen.length)
    const flaeche = planen.reduce((s, c) => s + Math.abs(c.scale[0]) * Math.abs(c.scale[1]), 0)
    expect(flaeche).toBeLessThan(4 * 9.15 * 31 * 1.1)
    expect(flaeche).toBeGreaterThan(4 * 9.15 * 31 * 0.8)
  })
})
