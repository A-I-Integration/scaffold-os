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

describe('Dachneigung mit Vorbau', () => {
  it('rechnet mit der Tiefe des Hauptkörpers, nicht mit dem umschließenden Rechteck', async () => {
    const { planImportAus } = await import('../plan-import')
    const mpp = (0.0254 / 72) * 100
    const pt = (m: number) => m / mpp
    // EG-Kontur: 13,8 × 8,7 plus Vorbau 4,3 × 1,5 oben → umschließend 13,8 × 10,2
    const k = [[0, 1.5], [6.6, 1.5], [6.6, 0], [10.9, 0], [10.9, 1.5], [13.8, 1.5], [13.8, 10.2], [0, 10.2]].map(([x, y]) => ({ x: pt(x), y: pt(y) }))
    const g = [{ titel: 'ERDGESCHOSS', ebene: 0, kontur: k, farbe: '#000', breiteM: 13.8, tiefeM: 10.2, flaecheM2: 126 }]
    // First oben (y klein), Traufe unten → Pultdach über die y-Achse
    const texte = [{ s: 'FIRST', x: pt(7), y: pt(0.5) }, { s: '+6,94', x: pt(7), y: pt(1.2) }, { s: 'Traufe', x: pt(7), y: pt(9.5) }, { s: '+5,92', x: pt(7), y: pt(10) }]
    const r = planImportAus('x.pdf', 100, g, texte)
    expect(r?.geschosse[0].breiteM).toBeCloseTo(8.7, 1)
    if (r?.dachneigungGrad !== undefined) expect(r.dachneigungGrad).toBeCloseTo((Math.atan(1.02 / 8.7) * 180) / Math.PI, 0)
  })
})
