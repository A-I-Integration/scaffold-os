import { describe, expect, it } from 'vitest'
import { planImportAus, ruecksprunge } from '../plan-import'
import type { GefundenerGrundriss } from '../grundriss-finden'

const g = (titel: string, ebene: number, b: number, t: number): GefundenerGrundriss => ({ titel, ebene, kontur: [], farbe: '#ff8000', breiteM: b, tiefeM: t, flaecheM2: b * t })

describe('planImportAus', () => {
  it('wählt das größte Geschoss über dem Gelände und meldet Rücksprünge', () => {
    const p = planImportAus('plan.pdf', 100, [g('KELLERGESCHOSS', -1, 13.2, 14), g('ERDGESCHOSS', 0, 13.78, 10.34), g('1. OBERGESCHOSS', 1, 10.1, 10.3)])!
    expect(p.hauptEbene).toBe(0)
    expect(p.geschosse[1]).toMatchObject({ laengeM: 13.78, breiteM: 10.34 })
    expect(ruecksprunge(p).map((x) => x.titel)).toEqual(['1. OBERGESCHOSS'])
  })
  it('der Keller ist nie das Hauptgeschoss, auch wenn er größer ist', () => {
    const p = planImportAus('plan.pdf', 100, [g('KELLERGESCHOSS', -1, 20, 20), g('ERDGESCHOSS', 0, 10, 8)])!
    expect(p.hauptEbene).toBe(0)
  })
  it('nur Keller oder nichts gefunden → null', () => {
    expect(planImportAus('plan.pdf', 100, [g('KELLERGESCHOSS', -1, 10, 8)])).toBeNull()
    expect(planImportAus('plan.pdf', 100, [])).toBeNull()
  })
  it('Länge ist immer die längere Seite', () => {
    const p = planImportAus('plan.pdf', 100, [g('ERDGESCHOSS', 0, 6, 12)])!
    expect(p.geschosse[0]).toMatchObject({ laengeM: 12, breiteM: 6 })
  })
})
