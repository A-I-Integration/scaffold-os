import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { erzeugeProjektblattPdf, projektblattTabellen } from '../projektblatt-pdf'
import type { MaterialItem } from '@/types/scaffold'

const mat = (name: string, category: string, quantity: number): MaterialItem =>
  ({ articleNumber: name, name, category, quantity, unit: 'Stk', unitPrice: 0, totalPrice: 0, weightKg: 0, riskLevel: 'low', aiRecommendation: '' }) as MaterialItem
const modell = () => generateCADModel({ lengthM: 12, widthM: 9, heightM: 9, eavesHeightM: 6, roofHeightM: 3, roofForm: 'satteldach', floors: 3, sides: ['front', 'back', 'left', 'right'] } as unknown as BuildingParams, 'layher-allround')
const opt = { projektName: 'Test', firma: 'Firma', datum: '17.11.2026', systemName: 'Layher Allround (Stahl)' }

describe('Projektblatt', () => {
  it('Tabellen enthalten nur belegte Werte, Zahlen deutsch formatiert', () => {
    const t = projektblattTabellen(modell(), [mat('Treppe', 'Treppen', 2)], opt.systemName)
    const alle = t.flatMap((x) => x.zeilen)
    expect(alle.find((z) => z.label === 'Länge')?.wert).toBe('12,00 m')
    expect(alle.find((z) => z.label === 'Gerüstsystem')?.wert).toBe('Layher Allround (Stahl)')
    expect(alle.find((z) => z.label === 'Treppen')?.wert).toBe('2')
    expect(alle.some((z) => /undefined|NaN/.test(z.wert + z.label))).toBe(false)
  })
  it('ohne Treppen-Material keine Treppenzeile; ohne Plankoten keine Höhenkoten-Tabelle', () => {
    const t = projektblattTabellen(modell(), [], opt.systemName)
    expect(t.flatMap((x) => x.zeilen).some((z) => z.label === 'Treppen')).toBe(false)
    expect(t.some((x) => x.titel.startsWith('Höhenkoten'))).toBe(false)
  })
  it('erzeugt ein einseitiges A3-PDF', () => {
    const pdf = erzeugeProjektblattPdf(modell(), [], opt)
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
    const text = new TextDecoder('latin1').decode(pdf)
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1)
    expect(text).toMatch(/1190\.\d+ 841\.\d+|841\.\d+ 1190\.\d+/)
  })
})
