import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, calculateLogistics, type BuildingParams } from '@/lib/calculations/cad-engine'
import { rechteckUmriss } from '@/lib/calculations/cad-umriss'
import { erzeugeLeistungsverzeichnis, LV_STANDARD_EINGABEN, type LvEingaben, type LvStil } from '@/lib/leistungsverzeichnis'
import { rechnungAusLv } from '@/lib/lv-zu-rechnung'
import { erzeugeGaebX83 } from '@/lib/gaeb-export'
import type { MaterialItem } from '@/types/scaffold'

function zufall(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 } }

function quelle(l: number, b: number, h: number) {
  const gebaeude: BuildingParams = {
    lengthM: l, widthM: b, heightM: h, eavesHeightM: h, roofHeightM: 0, roofForm: 'flachdach',
    floors: Math.max(1, Math.round(h / 3)), floorHeightsM: Array.from({ length: Math.max(1, Math.round(h / 3)) }, () => 3), windowCount: 0, doorCount: 0, balconyCount: 0,
    overhangM: 0, setbackM: 0, sides: ['front'], umriss: rechteckUmriss(l, b),
  }
  const model = generateCADModel(gebaeude, 'layher-allround')
  const materials: MaterialItem[] = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
  const log = calculateLogistics(model, materials, 2.0)
  return { model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }
}

const STILE: LvStil[] = ['getrennt', 'grundstandzeit', 'statiker', 'preisliste']

describe('Leistungsverzeichnis erzeugen: Regeln gelten für jede Eingabe', () => {
  it('Zufallstest über Gebäudegrößen, Stile und Eingaben (50 Fälle)', () => {
    const z = zufall(99)
    for (let i = 0; i < 50; i++) {
      const q = quelle(5 + z() * 40, 4 + z() * 20, 4 + z() * 26)
      const e: LvEingaben = {
        ...LV_STANDARD_EINGABEN, stil: STILE[Math.floor(z() * 4)],
        stundensatzFach: z() * 80, stundensatzHelfer: z() * 60, mietsatzProzentJeWoche: z() * 3, zuschlagProzent: z() * 30,
        statikPauschale: z() < 0.5 ? 0 : z() * 2000, gesamtStandzeitWochen: Math.floor(z() * 30),
        mwstProzent: z() < 0.8 ? 19 : 7,
      }
      const lv = erzeugeLeistungsverzeichnis(q, e)
      let titelSumme = 0
      for (const t of lv.titel) {
        let s = 0
        for (const p of t.positionen) {
          for (const v of [p.menge, p.ep, p.gp]) expect(Number.isFinite(v), `Fall ${i} ${p.nr} ${p.titel}`).toBe(true)
          expect(p.menge, `Fall ${i} ${p.nr}`).toBeGreaterThanOrEqual(0)
          expect(p.ep).toBeGreaterThanOrEqual(0)
          const f = (p.faktorProzent && p.faktorProzent > 0 ? p.faktorProzent : 100) / 100
          expect(Math.abs(p.gp - Math.round(p.menge * p.ep * f * 100) / 100), `Fall ${i} ${p.nr} ${p.titel}: gp ${p.gp} ≠ ${p.menge}×${p.ep}×${f}`).toBeLessThanOrEqual(0.011)
          if (p.entfaellt) { expect(p.menge).toBe(0); expect(p.gp).toBe(0) }
          s += p.gp
        }
        expect(Math.abs(t.summe - s), `Fall ${i} Titel ${t.nr}`).toBeLessThanOrEqual(0.011)
        titelSumme += t.summe
      }
      expect(Math.abs(lv.summeNetto - titelSumme)).toBeLessThanOrEqual(0.011)
      expect(Math.abs(lv.mwst - Math.round(lv.summeNetto * e.mwstProzent) / 100), `MwSt Fall ${i}`).toBeLessThanOrEqual(0.011)
      expect(Math.abs(lv.summeBrutto - (lv.summeNetto + lv.mwst))).toBeLessThanOrEqual(0.011)
      // Positionsnummern sind je Titel fortlaufend und eindeutig
      const nrn = lv.titel.flatMap((t) => t.positionen.map((p) => p.nr))
      expect(new Set(nrn).size, `doppelte Positionsnummern in Fall ${i}`).toBe(nrn.length)

      // Rechnung daraus: Abweichung nur durch Cent-Rundung des Einzelpreises
      const r = rechnungAusLv(lv)
      const grenze = r.positions.reduce((s, p) => s + p.menge * 0.005, 0) + 0.011
      expect(Math.abs(r.rundungsDifferenz), `Rechnung Fall ${i}`).toBeLessThanOrEqual(grenze)
    }
  }, 60000)

  it('Standzeit bis zur Grundstandzeit kostet keine Vorhaltung, darüber wächst sie mit den Wochen', () => {
    const q = quelle(12, 8, 12)
    const vorh = (wochen: number) => {
      const lv = erzeugeLeistungsverzeichnis(q, { ...LV_STANDARD_EINGABEN, stil: 'grundstandzeit', stundensatzFach: 50, stundensatzHelfer: 40, mietsatzProzentJeWoche: 1, zuschlagProzent: 10, gesamtStandzeitWochen: wochen })
      return lv.titel.flatMap((t) => t.positionen).filter((p) => p.titel.startsWith('Verlängerung der Vorhaltung')).reduce((s, p) => s + p.gp, 0)
    }
    expect(vorh(4)).toBe(0)
    expect(vorh(2)).toBe(0)
    expect(vorh(8)).toBeGreaterThan(0)
    expect(vorh(12)).toBeCloseTo(vorh(8) * 2, 0)
  })

  it('GAEB-Export: jede LV-Position steht genau einmal drin, Mengen sind lesbar', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(12, 8, 12), { ...LV_STANDARD_EINGABEN, stundensatzFach: 50, stundensatzHelfer: 40, mietsatzProzentJeWoche: 1, zuschlagProzent: 10 })
    const xml = erzeugeGaebX83(lv)
    const anzahl = lv.titel.reduce((s, t) => s + t.positionen.length, 0)
    expect((xml.match(/<Item\b/g) || []).length).toBe(anzahl)
    expect(xml).not.toMatch(/NaN|undefined|Infinity/)
    expect(xml.startsWith('<?xml')).toBe(true)
  })
})
