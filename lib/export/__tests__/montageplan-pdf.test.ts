import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { erzeugeMontageplanPdf, gruppiereMaterial } from '../montageplan-pdf'
import type { MaterialItem } from '@/types/scaffold'

const mat = (name: string, category: string, quantity: number, articleNumber = name): MaterialItem =>
  ({ articleNumber, name, category, quantity, unit: 'Stk', unitPrice: 0, totalPrice: 0, weightKg: 0, riskLevel: 'low', aiRecommendation: '' }) as MaterialItem

const modell = () => generateCADModel({ lengthM: 12, widthM: 9, heightM: 9, eavesHeightM: 6, roofHeightM: 3, roofForm: 'satteldach' } as unknown as BuildingParams, 'layher-allround')
const opt = { projektName: 'Test', firma: 'Firma', datum: '17.11.2026', systemName: 'Layher Allround' }

describe('Montageplan-PDF', () => {
  it('gruppiert die Materialliste in Ladereihenfolge, ohne Menge 0', () => {
    const g = gruppiereMaterial([mat('B', 'Geländer', 3), mat('A', 'Rahmen', 2), mat('C', 'Anker', 1), mat('D', 'Belag', 0), mat('E', 'Sonstiges', 4)])
    expect(g.map(([n]) => n)).toEqual(['Rahmen', 'Horizontal + Abschluss', 'Kupplungen + Verankerung', 'Sonstiges'])
  })
  it('erzeugt ein PDF mit Ansichtsseite und Materialliste', () => {
    const m = modell()
    const pdf = erzeugeMontageplanPdf(m, [mat('Vertikalrahmen 200/70', 'Rahmen', 38), mat('Hohlkastenbelag 300/32', 'Belag', 74)], opt)
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
    const text = new TextDecoder('latin1').decode(pdf)
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
  it('bricht lange Listen auf mehrere Seiten um und läuft auch mit leerer Liste', () => {
    const m = modell()
    const viele = Array.from({ length: 120 }, (_, i) => mat(`Teil ${i}`, 'Rahmen', i + 1))
    const text = new TextDecoder('latin1').decode(erzeugeMontageplanPdf(m, viele, opt))
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(erzeugeMontageplanPdf(m, [], opt).length).toBeGreaterThan(1000)
  })
})

import { bildZuordnung } from '../artikelbilder'
describe('Bildzuordnung', () => {
  it('eigenes Bild vor Symbolbild; ohne Katalog des Systems kein Bild', () => {
    const index = { '2678.129': 'x.jpg' }
    const z = bildZuordnung([mat('Diagonale', 'Diagonalen', 3, '2678.129'), mat('Rahmen', 'Rahmen', 2, 'RA-003')], 'layher-allround', index)
    expect(z['2678.129']).toEqual({ bildNr: '2678.129', symbol: false })
    expect(z['RA-003']).toBeUndefined()
    expect(bildZuordnung([mat('Rahmen', 'Rahmen', 2, 'RA-003')], 'unbekannt', index)).toEqual({})
  })
})
