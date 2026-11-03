import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'
import { generateCADModel, generateBillOfMaterials, calculateLogistics, type BuildingParams } from '../calculations/cad-engine'
import { rechteckUmriss } from '../calculations/cad-umriss'
import { erzeugeLeistungsverzeichnis, LV_STANDARD_EINGABEN, type LvEingaben, type LvStil } from '../leistungsverzeichnis'
import { erzeugeGaebX83, gaebEinheit, gaebMenge, gaebPositionsNr } from '../gaeb-export'
import { parseGaebPositions } from '../gaeb'
import type { MaterialItem } from '@/types/scaffold'

const gebaeude: BuildingParams = {
  lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach',
  floors: 4, floorHeightsM: [3, 3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'], umriss: rechteckUmriss(10, 8),
}
function lvFuer(stil: LvStil) {
  const model = generateCADModel(gebaeude, 'layher-allround')
  const materials: MaterialItem[] = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
  const log = calculateLogistics(model, materials, 2.0)
  const e: LvEingaben = { ...LV_STANDARD_EINGABEN, stil, stundensatzFach: 50, stundensatzHelfer: 40, mietsatzProzentJeWoche: 1, zuschlagProzent: 10, statikPauschale: 900 }
  return erzeugeLeistungsverzeichnis({ model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }, e)
}

describe('GAEB X83 aus dem Leistungsverzeichnis', () => {
  it('Hilfsfunktionen: Einheit, Menge, Positionsnummer', () => {
    expect(gaebEinheit('m²')).toBe('m2')
    expect(gaebEinheit('m²Wo')).toBe('m2Wo')
    expect(gaebEinheit('Stück')).toBe('Stk')
    expect(gaebEinheit('Stck.')).toBe('Stk')
    expect(gaebEinheit('Std')).toBe('h')
    expect(gaebEinheit('Psch')).toBe('psch')
    expect(gaebEinheit('Einsatz')).toBe('Eins')
    expect(gaebEinheit('')).toBe('Stk')
    expect(gaebEinheit('StWo')).toBe('StWo')
    expect(gaebEinheit('StckWo')).toBe('StWo')
    expect(gaebEinheit('PschWo')).toBe('psWo')
    expect(gaebEinheit('lfdmWo')).toBe('mWo')
    expect(gaebEinheit('m²/Wo')).toBe('m2Wo')
    expect(gaebEinheit('m/Wo')).toBe('mWo')
    expect(gaebEinheit('Wo')).toBe('Wo')
    expect(gaebEinheit('lfdm')).toBe('lfdm')
    expect(gaebMenge(957.78)).toBe('957.78')
    expect(gaebMenge(1.23456)).toBe('1.235')
    expect(gaebMenge(4)).toBe('4')
    expect(gaebPositionsNr('02.3', 1)).toBe('0003')
    expect(gaebPositionsNr('02.10', 1)).toBe('0010')
    expect(gaebPositionsNr('x', 7)).toBe('0007')
  })

  for (const stil of ['getrennt', 'grundstandzeit', 'preisliste', 'statiker'] as LvStil[]) {
    it(`Stil ${stil}: gültiges XML, alle Positionen mit Menge, keine Preise`, () => {
      const lv = lvFuer(stil)
      const xml = erzeugeGaebX83(lv, { bauvorhaben: 'Test & <Turm>', projektnummer: 'P-1', datum: '2026-11-03' })
      writeFileSync(`/tmp/gaeb-test-${stil}.x83`, xml, 'utf8')
      const baum = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false }).parse(xml)
      expect(baum.GAEB['@_xmlns']).toBe('http://www.gaeb.de/GAEB_DA_XML/DA83/3.3')
      expect(baum.GAEB.Award.DP).toBe('83')
      expect(xml).not.toMatch(/<UP>|<IT>/)
      const erwartet = lv.titel.flatMap((t) => t.positionen).filter((p) => !p.entfaellt && p.menge > 0)
      const gelesen = parseGaebPositions(xml)
      expect(gelesen.length).toBe(erwartet.length)
      expect(erwartet.length).toBeGreaterThan(2)
      // Mengen und Einheiten stimmen mit dem LV überein (Mengen auf 3 Stellen)
      const gelesenSumme = gelesen.reduce((s, p) => s + p.menge, 0)
      const lvSumme = erwartet.reduce((s, p) => s + Math.round(p.menge * 1000) / 1000, 0)
      expect(gelesenSumme).toBeCloseTo(lvSumme, 2)
      for (const p of gelesen) expect(p.einheit.length).toBeLessThanOrEqual(4)
      expect(xml).toContain('Test &amp; &lt;Turm&gt;')
    })
  }

  it('entfallene Positionen und leere Titel werden nicht ausgegeben, Nummern sind eindeutig', () => {
    const lv = lvFuer('getrennt')
    lv.titel[1].positionen[0].entfaellt = true
    lv.titel[1].positionen[0].menge = 0
    const xml = erzeugeGaebX83(lv)
    const nummern = [...xml.matchAll(/<Item ID="I\d+" RNoPart="(\d+)"/g)].map((m) => m[1])
    const proTitel = xml.split('<BoQCtgy ').slice(1).map((b) => [...b.matchAll(/<Item ID="I\d+" RNoPart="(\d+)"/g)].map((m) => m[1]))
    for (const liste of proTitel) expect(new Set(liste).size).toBe(liste.length)
    expect(nummern.length).toBeGreaterThan(0)
    expect(xml).not.toContain(lv.titel[1].positionen[0].titel.slice(0, 40) + '</span>')
    for (const t of lv.titel) t.positionen.forEach((p) => { p.entfaellt = true })
    expect(erzeugeGaebX83(lv)).not.toContain('<BoQCtgy')
  })
})
