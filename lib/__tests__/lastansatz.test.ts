import { describe, it, expect } from 'vitest'
import { lagenansatz, lagenansatzText, verkehrslast, KRAN_FAKTOR } from '../lastansatz'

describe('Lastansatz nach DIN EN 12811-1', () => {
  it('Tabelle 3: q1, q2 und Teilflächenfaktor', () => {
    expect(verkehrslast(3)).toMatchObject({ q1: 2.0, q2: null, ap: null })
    expect(verkehrslast(4)).toMatchObject({ q1: 3.0, f1: 3.0, q2: 5.0, ap: 0.4 })
    expect(verkehrslast(6)).toMatchObject({ q1: 6.0, q2: 10.0, ap: 0.5 })
    expect(verkehrslast(7)).toBeNull()
  })
  it('eine Lage zu 100 %, zweite zu 50 % (LK 4: 300 kg/m²)', () => {
    const a = lagenansatz(4)!
    expect(a.lage1KnM2).toBe(3)
    expect(a.lage1KgM2).toBe(300)
    expect(a.lage2KnM2).toBe(1.5)
    expect(a.summeKnM2).toBe(4.5)
  })
  it('Text nennt die Klasse, beide Lagen und ab LK 4 die Teilflächenlast', () => {
    const t = lagenansatzText(4)!
    expect(t).toContain('Lastklasse 4')
    expect(t).toContain('300 kg/m²')
    expect(t).toContain('50 %')
    expect(t).toContain('q2 = 5 kN/m²')
    expect(lagenansatzText(3)!).not.toContain('q2')
    expect(lagenansatzText(undefined)).toBeNull()
  })
  it('Kranfaktor 1,2', () => { expect(KRAN_FAKTOR).toBe(1.2) })
})

import { generateCADModel, generateBillOfMaterials, calculateLogistics, type BuildingParams } from '../calculations/cad-engine'
import { rechteckUmriss } from '../calculations/cad-umriss'
import { erzeugeLeistungsverzeichnis, LV_STANDARD_EINGABEN } from '../leistungsverzeichnis'
import type { MaterialItem } from '@/types/scaffold'

describe('Lastansatz im LV', () => {
  const b: BuildingParams = { lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach', floors: 4, floorHeightsM: [3, 3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'], umriss: rechteckUmriss(10, 8) }
  const model = generateCADModel(b, 'layher-allround')
  const materials: MaterialItem[] = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
  const log = calculateLogistics(model, materials, 2.0)
  const q = { model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }
  it('Annahmen nennen den Lastansatz der gewählten Klasse', () => {
    const lv = erzeugeLeistungsverzeichnis(q, { ...LV_STANDARD_EINGABEN, lastklasse: 4 })
    expect(lv.annahmen.some((a) => a.includes('Lastansatz Lastklasse 4') && a.includes('50 %'))).toBe(true)
  })
  it('Statiker-LV meldet Positionen, die von Hand zu füllen sind', () => {
    const lv = erzeugeLeistungsverzeichnis(q, { ...LV_STANDARD_EINGABEN, stil: 'statiker', lastklasse: 4 })
    const meldung = lv.fehlendeAngaben.find((f) => f.startsWith('Preis oder Menge von Hand'))
    expect(meldung).toBeDefined()
    expect(meldung).toContain('Überbrückungen')
    expect(meldung).toContain('Haltestellenausstattung')
    expect(meldung).toContain('Umbau der Gerüste')
  })
})
