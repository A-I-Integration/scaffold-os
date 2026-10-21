import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, type BuildingParams } from '../calculations/cad-engine'
import { erzeugeLeistungsverzeichnis, LV_STANDARD_EINGABEN, type LvEingaben } from '../leistungsverzeichnis'
import { erzeugeLvZuordnung, erzeugeLvZuordnungXlsx, LV_VORLAGE_WUPPERTAL } from '../lv-zuordnung'
import type { MaterialItem } from '@/types/scaffold'

const turm: BuildingParams = {
  lengthM: 9.14, widthM: 9.18, heightM: 31, eavesHeightM: 31, roofHeightM: 0, roofForm: 'flachdach',
  floors: 10, floorHeightsM: Array(10).fill(3.1), windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0,
  sides: ['front', 'back', 'left', 'right'], lastklasse: 4,
}
const model = generateCADModel(turm, 'layher-allround')
const materials: MaterialItem[] = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
const eingaben = (p: Partial<LvEingaben> = {}): LvEingaben => ({ ...LV_STANDARD_EINGABEN, lastklasse: 4, gesamtStandzeitWochen: 50, stundensatzFach: 50, stundensatzHelfer: 40, mietsatzProzentJeWoche: 1, zuschlagProzent: 0, statikPauschale: 900, ...p })
const lv = (p?: Partial<LvEingaben>) => erzeugeLeistungsverzeichnis({ model, materials, aufbauStunden: 100, abbauStunden: 50 }, eingaben(p))

describe('LV-Zuordnung (Wuppertal)', () => {
  it('hat alle Positionen der Vorlage in der Reihenfolge des LV', () => {
    const z = erzeugeLvZuordnung(lv(), model)
    expect(z.zeilen.map((x) => x.pos)).toEqual(LV_VORLAGE_WUPPERTAL.map((x) => x.pos))
  })
  it('Pos. 02.1 = Aufbau + Abbau, 02.2 = Vorhaltung mit Standzeit als Menge', () => {
    const l = lv()
    const z = erzeugeLvZuordnung(l, model)
    const p = (n: string) => z.zeilen.find((x) => x.pos === n)!
    const auf = l.titel[1].positionen.find((x) => x.titel.endsWith('Fassadengerüst – Aufbau'))!
    const ab = l.titel[1].positionen.find((x) => x.titel === 'Arbeits- und Schutzgerüst – Abbau')!
    const vorh = l.titel[1].positionen.find((x) => x.titel === 'Vorhaltung Arbeits- und Schutzgerüst')!
    expect(p('02.1').menge).toBe(1)
    expect(p('02.1').gp).toBeCloseTo(auf.gp + ab.gp, 2)
    expect(p('02.2').menge).toBe(50)
    expect((p('02.2').ep ?? 0) * 50).toBeCloseTo(vorh.gp, 0)
    expect(p('11.1').ep).toBe(900)
    expect(p('12.1').gp).toBe(2500) // 50 h × 50 €
    expect(p('12.3').gp).toBe(2000) // 50 h × 40 €
  })
  it('lässt unbekannte Positionen leer und erfindet nichts', () => {
    const z = erzeugeLvZuordnung(lv(), model)
    for (const n of ['02.3', '02.9', '02.11', '02.15', '02.21', '02.25', '01.3']) {
      const x = z.zeilen.find((y) => y.pos === n)!
      expect(x.ep).toBeNull()
      expect(x.gp).toBeNull()
      expect(x.hinweis).toContain('Nicht aus dem CAD')
    }
  })
  it('ohne Stundensatz/Pauschale bleibt der Preis leer und der Hinweis nennt es', () => {
    const z = erzeugeLvZuordnung(lv({ stundensatzFach: 0, statikPauschale: 0 }), model)
    expect(z.zeilen.find((x) => x.pos === '12.1')!.ep).toBeNull()
    expect(z.zeilen.find((x) => x.pos === '11.1')!.ep).toBeNull()
  })
  it('Summe = Summe der befüllten Positionen', () => {
    const z = erzeugeLvZuordnung(lv(), model)
    expect(z.summeNetto).toBeCloseTo(z.zeilen.reduce((s, x) => s + (x.gp ?? 0), 0), 2)
    expect(z.kopf.find((k) => k.label === 'Lastklasse')!.wert).toBe('4')
  })
  it('Stil „Auf-/Abbau inkl. Vorhaltung“ lässt die Gerüstpositionen leer', () => {
    const z = erzeugeLvZuordnung(lv({ stil: 'grundstandzeit' }), model)
    expect(z.zeilen.find((x) => x.pos === '02.1')!.ep).toBeNull()
    expect(z.hinweise.some((h) => h.includes('getrennt'))).toBe(true)
  })
  it('erzeugt eine Excel-Datei', async () => {
    const daten = await erzeugeLvZuordnungXlsx(erzeugeLvZuordnung(lv(), model))
    expect(daten.byteLength).toBeGreaterThan(2000)
    expect(new Uint8Array(daten.slice(0, 2))).toEqual(new Uint8Array([0x50, 0x4b])) // ZIP/XLSX
  })
})
