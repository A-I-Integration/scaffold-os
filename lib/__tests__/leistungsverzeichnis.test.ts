import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, calculateLogistics, type BuildingParams } from '../calculations/cad-engine'
import { rechteckUmriss } from '../calculations/cad-umriss'
import { erzeugeLeistungsverzeichnis, breitenklasse, LV_STANDARD_EINGABEN, LASTKLASSEN, type LvEingaben } from '../leistungsverzeichnis'
import type { MaterialItem } from '@/types/scaffold'

const gebaeude: BuildingParams = {
  lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach',
  floors: 4, floorHeightsM: [3, 3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'], umriss: rechteckUmriss(10, 8),
}

function quelle() {
  const model = generateCADModel(gebaeude, 'layher-allround')
  // Test-Materialwert: jeder Artikel 10 € (nur für den Test, keine echten Preise)
  const materials: MaterialItem[] = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
  const log = calculateLogistics(model, materials, 2.0)
  return { model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }
}

const mitPreisen: LvEingaben = { ...LV_STANDARD_EINGABEN, stundensatzFach: 50, stundensatzHelfer: 40, mietsatzProzentJeWoche: 1, zuschlagProzent: 10 }

describe('Leistungsverzeichnis', () => {
  it('Breitenklasse nach Gerüstbreite', () => {
    expect(breitenklasse(0.73)).toBe('W06')
    expect(breitenklasse(0.6)).toBe('W06')
    expect(breitenklasse(0.9)).toBe('W09')
    expect(breitenklasse(1.09)).toBe('W09')
    expect(breitenklasse(1.2)).toBe('W12')
    expect(breitenklasse(0.5)).toBe('kleiner als W06')
    expect(breitenklasse(0)).toBe('unbekannt')
  })

  it('Positionen mit Mengen aus dem CAD, Treppe und Vorhaltung', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), mitPreisen)
    const q = quelle()
    const t1 = lv.titel[0].positionen
    expect(t1[0].nr).toBe('1.01')
    expect(t1[0].einheit).toBe('m²')
    expect(t1[0].menge).toBeCloseTo(q.model.totalAreaM2, 2)
    // Standzeit 8 Wochen → 4 Wochen Vorhaltung über die Grundstandzeit
    const vorh = t1.find((p) => p.nr === '1.02')!
    expect(vorh.einheit).toBe('m²/Wo')
    expect(vorh.menge).toBeCloseTo(q.model.totalAreaM2 * 4, 1)
    // Treppenturm ist im Modell (Gebäude > 1 Lage) → Position in Stück
    const tr = t1.find((p) => p.einheit === 'Stk')!
    expect(tr.menge).toBe(1)
  })

  it('Preise: EP × Menge = GP, Summen, MwSt, brutto – alles gerundet auf Cent', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), mitPreisen)
    for (const t of lv.titel) {
      for (const p of t.positionen) {
        expect(p.ep).toBeGreaterThan(0)
        expect(p.gp).toBeCloseTo(Math.round(p.menge * p.ep * 100) / 100, 2)
      }
      expect(t.summe).toBeCloseTo(t.positionen.reduce((s, p) => s + p.gp, 0), 2)
    }
    expect(lv.summeNetto).toBeCloseTo(lv.titel.reduce((s, t) => s + t.summe, 0), 2)
    expect(lv.mwst).toBeCloseTo(lv.summeNetto * 0.19, 2)
    expect(lv.summeBrutto).toBeCloseTo(lv.summeNetto + lv.mwst, 2)
    expect(lv.fehlendeAngaben).toEqual([])
  })

  it('Stundenlohn: Stunden × Stundensatz', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), mitPreisen)
    const [fach, helfer] = lv.titel[1].positionen
    expect(fach.gp).toBe(16 * 50)
    expect(helfer.gp).toBe(16 * 40)
  })

  it('Vorhaltung entfällt bei Standzeit ≤ Grundstandzeit', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, gesamtStandzeitWochen: 4 })
    expect(lv.titel[0].positionen.some((p) => p.einheit.endsWith('/Wo'))).toBe(false)
  })

  it('Ohne Eingaben: keine erfundenen Preise, Pflichtangaben werden gemeldet', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), LV_STANDARD_EINGABEN)
    expect(lv.summeNetto).toBe(0)
    expect(lv.fehlendeAngaben.join(' ')).toMatch(/Stundensatz Facharbeiter/)
    expect(lv.fehlendeAngaben.join(' ')).toMatch(/Mietsatz/)
  })

  it('Ohne Lagerpreise meldet das LV den fehlenden Materialwert', () => {
    const q = quelle()
    const ohne = { ...q, materials: q.materials.map((m) => ({ ...m, unitPrice: 0, totalPrice: 0 })) }
    const lv = erzeugeLeistungsverzeichnis(ohne, mitPreisen)
    expect(lv.fehlendeAngaben.join(' ')).toMatch(/Materialwert/)
  })

  it('Kopf zeigt Lastklasse und Breitenklasse im Langtext', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, lastklasse: 4 })
    const text = lv.titel[0].positionen[0].text.join(' ')
    expect(text).toMatch(/Lastklasse 4/)
    expect(text).toMatch(/W06/)
    expect(LASTKLASSEN[4]).toBe(3)
  })
})
