import { describe, it, expect } from 'vitest'
import { BAUKASTEN_START, baukastenZuGebaeude, rechteckAlsWandzug, wandzugZuUmriss } from '../manuell-baukasten'
import { generateCADModel } from '@/lib/calculations/cad-engine'

describe('Manueller Baukasten', () => {
  it('meldet fehlende Pflichtmaße statt zu raten', () => {
    const r = baukastenZuGebaeude(BAUKASTEN_START)
    expect(r.ok).toBe(false)
    expect(r.fehler.join(' ')).toMatch(/Länge/)
  })
  it('Rechteck: übernimmt Maße, Traufe = Höhe wenn leer', () => {
    const r = baukastenZuGebaeude({ ...BAUKASTEN_START, laengeM: 12, breiteM: 8, hoeheM: 7 })
    expect(r.ok).toBe(true)
    expect(r.building).toMatchObject({ lengthM: 12, widthM: 8, heightM: 7, eavesHeightM: 7 })
  })
  it('Wandzug: geschlossenes Rechteck wird erkannt', () => {
    const { lueckeM } = wandzugZuUmriss(rechteckAlsWandzug(12, 8, 7))
    expect(lueckeM).toBeLessThan(0.01)
  })
  it('Wandzug: nicht geschlossen → Fehler mit Lückenmaß', () => {
    const w = rechteckAlsWandzug(12, 8, 7); w[3].laengeM = 7
    const r = baukastenZuGebaeude({ ...BAUKASTEN_START, form: 'wandzug', waende: w })
    expect(r.ok).toBe(false)
    expect(r.fehler[0]).toMatch(/schließt nicht.*1 m/)
  })
  it('Wandzug in L-Form: Höhe je Wand, Gerüst und Plan entstehen', () => {
    const w = [
      { laengeM: 12, hoeheM: 7, winkelGrad: 90 }, { laengeM: 5, hoeheM: 7, winkelGrad: 90 },
      { laengeM: 6, hoeheM: 4, winkelGrad: -90 }, { laengeM: 4, hoeheM: 4, winkelGrad: 90 },
      { laengeM: 6, hoeheM: 4, winkelGrad: 90 }, { laengeM: 9, hoeheM: 7, winkelGrad: 90 },
    ]
    const r = baukastenZuGebaeude({ ...BAUKASTEN_START, form: 'wandzug', waende: w, dach: 'flachdach' })
    expect(r.fehler).toEqual([])
    expect(r.building?.umrissKantenHoeheM).toEqual([7, 7, 4, 4, 4, 7])
    const m = generateCADModel(r.building!, 'layher-allround')
    expect(m.components3D.length).toBeGreaterThan(50)
    expect(m.totalAreaM2).toBeGreaterThan(100)
  })
})

describe('Grundriss des Baukastens', () => {
  it('zeichnet bei L-Haus die echte Kontur (Pfad) statt des Hüll-Rechtecks', async () => {
    const { generateGrundriss } = await import('@/lib/calculations/cad-engine')
    const w = [
      { laengeM: 12, hoeheM: 7, winkelGrad: 90 }, { laengeM: 5, hoeheM: 7, winkelGrad: 90 },
      { laengeM: 6, hoeheM: 4, winkelGrad: -90 }, { laengeM: 4, hoeheM: 4, winkelGrad: 90 },
      { laengeM: 6, hoeheM: 4, winkelGrad: 90 }, { laengeM: 9, hoeheM: 7, winkelGrad: 90 },
    ]
    const r = baukastenZuGebaeude({ ...BAUKASTEN_START, form: 'wandzug', waende: w, dach: 'flachdach' })
    const g = generateGrundriss(generateCADModel(r.building!, 'layher-allround'))
    const haus = g.elements.find((x) => x.id === 'building')!
    expect(haus.type).toBe('path')
    expect((haus.d!.match(/L/g) ?? []).length).toBe(5) // 6 Ecken
    expect(g.elements.filter((x) => x.id.startsWith('kantenmass-')).length).toBe(6)
  })
})
