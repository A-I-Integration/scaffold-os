import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, calculateLogistics, type BuildingParams } from '../../calculations/cad-engine'
import { kappeModellAufHoehe, kappeMaterial } from '../bauabschnitt'
import { erzeugeLeistungsverzeichnis, LV_STANDARD_EINGABEN, type LvEingaben } from '../../leistungsverzeichnis'
import type { MaterialItem } from '@/types/scaffold'

const turm: BuildingParams = {
  lengthM: 8, widthM: 8, heightM: 32, eavesHeightM: 32, roofHeightM: 0, roofForm: 'flachdach',
  floors: 8, floorHeightsM: [4, 4, 4, 4, 4, 4, 4, 4], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
  geruestOptionen: { treppe: true, kederplane: { vonM: 0, bisM: 32 } } as BuildingParams['geruestOptionen'],
}
const voll = () => generateCADModel(turm, 'layher-allround')

describe('2. Bauabschnitt – Gerüst kappen', () => {
  it('lässt nur Lagen bis ca. zur Höhe stehen und kürzt Fläche, Bauteile, Anker', () => {
    const m = voll()
    const k = kappeModellAufHoehe(m, 21.5)!
    expect(k).not.toBeNull()
    expect(Math.abs(k.obenM - 21.5)).toBeLessThanOrEqual(1.0 + 1e-6) // Raster 2 m: nächstgelegene Lage
    expect(k.lagenBehalten).toBeLessThan(k.lagenGesamt)
    expect(k.lagenGesamt).toBeLessThanOrEqual(20) // Lagen übereinander, nicht aller Seiten zusammen
    expect(k.model.totalHeightM).toBeCloseTo(k.obenM, 2)
    expect(k.model.totalAreaM2).toBeLessThan(m.totalAreaM2)
    expect(k.model.totalAreaM2).toBeCloseTo(m.totalAreaM2 * k.flaechenAnteil, 1)
    expect(k.model.components3D.length).toBeLessThan(m.components3D.length)
    for (const c of k.model.components3D) if (c.type === 'anchor') expect(c.position[1]).toBeLessThanOrEqual(k.obenM + 1e-6)
    expect(k.model.anchors.every((a) => a.positionY <= k.obenM + 1e-6)).toBe(true)
  })

  it('kein Bauteil ragt über die gekappte Oberkante (Treppe und Plane eingeschlossen)', () => {
    const k = kappeModellAufHoehe(voll(), 21.5)!
    for (const c of k.model.components3D) {
      if (c.type === 'stair') expect(c.position[1] + c.scale[1] / 2).toBeLessThanOrEqual(k.obenM + 1e-6)
      if (c.type === 'sheeting') expect(c.position[1] + c.scale[1] / 2).toBeLessThanOrEqual(k.obenM + 1e-6)
    }
  })

  it('null, wenn nichts zu kappen ist', () => {
    const m = voll()
    expect(kappeModellAufHoehe(m, 99)).toBeNull()
    expect(kappeModellAufHoehe(m, 0)).toBeNull()
  })

  it('Material: Mengen und Preise sinken, nichts steigt', () => {
    const m = voll()
    const k = kappeModellAufHoehe(m, 21.5)!
    const mat: MaterialItem[] = generateBillOfMaterials(m).map((x) => ({ ...x, unitPrice: 10, totalPrice: x.quantity * 10 }))
    const mat2 = kappeMaterial(mat, m, k.model)
    const sum = (l: MaterialItem[]) => l.reduce((s, x) => s + x.totalPrice, 0)
    expect(sum(mat2)).toBeLessThan(sum(mat))
    expect(sum(mat2)).toBeGreaterThan(0)
    for (const x of mat2) expect(x.quantity).toBeLessThanOrEqual(mat.find((y) => y.articleNumber === x.articleNumber)!.quantity)
  })
})

describe('2. Bauabschnitt im LV (Stil statiker)', () => {
  const quelle = () => {
    const model = voll()
    const materials: MaterialItem[] = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
    const log = calculateLogistics(model, materials, 2.0)
    return { model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }
  }
  const eing: LvEingaben = { ...LV_STANDARD_EINGABEN, stil: 'statiker', stundensatzFach: 50, stundensatzHelfer: 40, mietsatzProzentJeWoche: 1, zuschlagProzent: 10, gesamtStandzeitWochen: 50, geruestHoeheAusschreibungM: 32 }
  const pos = (lv: ReturnType<typeof erzeugeLeistungsverzeichnis>, teil: string) => lv.titel.flatMap((t) => t.positionen).find((p) => p.titel.includes(teil))!

  it('Gerüstposition 2. BA bekommt einen Preis, kleiner als der 1. BA', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), eing)
    const g1 = pos(lv, 'bis 32 m Höhe')
    const g2 = pos(lv, 'bis ca. 21,5 m Höhe')
    expect(g1.ep).toBeGreaterThan(0)
    expect(g2.ep).toBeGreaterThan(0)
    expect(g2.ep).toBeLessThan(g1.ep)
    expect(g2.text.join(' ')).toContain('gekappt')
  })

  it('Standzeit 2. BA bestimmt die Vorhaltungsmenge, Höhe 0 lässt die Positionen leer', () => {
    const q = quelle()
    const lv = erzeugeLeistungsverzeichnis(q, { ...eing, standzeitBa2Wochen: 12 })
    const v = lv.titel.flatMap((t) => t.positionen).find((p) => p.titel.startsWith('Vorhaltung zur Vorposition') && p.text.join(' ').includes('Arbeitsgerüste 2. BA'))!
    expect(v.menge).toBe(12)
    expect(v.ep).toBeGreaterThan(0)
    const leer = erzeugeLeistungsverzeichnis(q, { ...eing, hoeheBa2M: 0 })
    expect(pos(leer, 'bis ca. 21,5 m Höhe').ep).toBe(0)
  })

  it('Aufzug 2. BA: Höhe aus dem gekappten CAD, Preis bleibt leer; ohne Aufzug im CAD unverändert', () => {
    const mitAufzug = generateCADModel({ ...turm, geruestOptionen: { ...turm.geruestOptionen, aufzug: { seite: 'front', gemietet: false } } } as BuildingParams, 'layher-allround')
    const materials: MaterialItem[] = generateBillOfMaterials(mitAufzug).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
    const log = calculateLogistics(mitAufzug, materials, 2.0)
    const lv = erzeugeLeistungsverzeichnis({ model: mitAufzug, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }, eing)
    const az2 = pos(lv, 'Personen- und Lastenaufzug 500/800kg 2.BA')
    const k = kappeModellAufHoehe(mitAufzug, 21.5)!
    const hoehe = k.model.components3D.find((c) => c.type === 'elevator')!.scale[1]
    expect(hoehe).toBeLessThanOrEqual(k.obenM + 1e-6)
    expect(az2.text.join(' ')).toContain('gekappt')
    expect(az2.text.join(' ')).toContain(hoehe.toFixed(2).replace('.', ','))
    expect(az2.ep).toBe(0)
    const ohne = erzeugeLeistungsverzeichnis(quelle(), eing)
    expect(pos(ohne, 'Personen- und Lastenaufzug 500/800kg 2.BA').text.join(' ')).not.toContain('gekappt')
  })

  it('höhere gewählte Höhe → höherer Preis (monoton)', () => {
    const q = quelle()
    const ep = (h: number) => pos(erzeugeLeistungsverzeichnis(q, { ...eing, hoeheBa2M: h }), 'bis ca. 21,5 m Höhe').ep
    expect(ep(12)).toBeLessThan(ep(21.5))
    expect(ep(21.5)).toBeLessThan(ep(28))
  })
})
