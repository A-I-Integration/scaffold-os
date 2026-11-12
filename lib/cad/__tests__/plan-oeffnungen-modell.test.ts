import { describe, it, expect } from 'vitest'
import { oeffnungenAnKanten, oeffnungenFuerModell, vorbautenAnKanten, vorbautenFuerModell, type PlanOeffnungAnKante } from '../plan-oeffnungen-modell'
import { generateBuildingFeatures, type BuildingParams } from '../../calculations/cad-engine'

const MPP = 0.05 // 1 Punkt = 5 cm
const rechteck = { x0: 0, y0: 0, x1: 400, y1: 200 } // 20 × 10 m, Mitte bei (200, 100)
const o = (typ: 'tuer' | 'fenster', x: number, y: number, extra: Record<string, number> = {}) => ({ typ, x, y, breiteM: 1.1, ...extra })

describe('oeffnungenAnKanten', () => {
  it('ordnet Öffnungen der Kante zu und misst ab Kantenmitte', () => {
    const r = oeffnungenAnKanten([o('tuer', 100, 200), o('fenster', 300, 0), o('fenster', 0, 150), o('fenster', 400, 40)], rechteck, MPP)
    expect(r.abseits).toBe(0)
    expect(r.an.map((a) => [a.kante, a.alongM])).toEqual([['unten', -5], ['oben', 5], ['links', 2.5], ['rechts', -3]])
  })
  it('zählt Öffnungen an einem Vorbau (weit weg von den Kanten) als abseits', () => {
    const r = oeffnungenAnKanten([o('tuer', 100, 200), o('tuer', 100, -80), o('fenster', 700, 100), o('tuer', 100, 190)], rechteck, MPP)
    // die Tür 0,5 m vor der Kante (100, 190 liegt 10 Punkte = 0,5 m innen) gehört nicht mehr zur Wand
    expect(r.an).toHaveLength(1)
    expect(r.abseits).toBe(3)
  })
  it('nimmt Brüstung und Sturz aus dem Plan mit', () => {
    const r = oeffnungenAnKanten([o('fenster', 100, 200, { bruestungM: 0.85, sturzM: 2.1 })], rechteck, MPP)
    expect(r.an[0]).toMatchObject({ bruestungM: 0.85, sturzM: 2.1 })
  })
})

const a = (kante: PlanOeffnungAnKante['kante'], alongM: number, typ: PlanOeffnungAnKante['typ'] = 'fenster', extra: Partial<PlanOeffnungAnKante> = {}): PlanOeffnungAnKante => ({ typ, kante, alongM, breiteM: 1.1, ...extra })

describe('oeffnungenFuerModell', () => {
  it('Vorderseite unten: Süd bleibt vorne, Ost ist rechts im Bild', () => {
    const m = oeffnungenFuerModell([{ ebene: 0, oeffnungen: [a('unten', 2), a('oben', 2), a('links', 1), a('rechts', 1)] }], 'x', 3)!
    expect(m.vorderseite).toBe('unten')
    expect(m.fenster.map((f) => [f.side, f.offsetAlongM])).toEqual([['front', 2], ['back', 2], ['left', 1], ['right', 1]])
  })
  it('wählt die lange Kante mit den meisten Öffnungen als Vorderseite und dreht den Plan', () => {
    const m = oeffnungenFuerModell([{ ebene: 0, oeffnungen: [a('oben', 2), a('oben', -3), a('unten', 2), a('links', 1), a('rechts', 1)] }], 'x', 3)!
    expect(m.vorderseite).toBe('oben')
    // Blick von Norden: Plan-Osten (x+) liegt links im Bild
    expect(m.fenster.map((f) => [f.side, f.offsetAlongM])).toEqual([['front', -2], ['front', 3], ['back', -2], ['right', -1], ['left', -1]])
  })
  it('Türen zählen doppelt: lieber die Eingangsseite vorne', () => {
    const m = oeffnungenFuerModell([{ ebene: 0, oeffnungen: [a('oben', 1), a('oben', 2), a('oben', 3), a('unten', 0, 'tuer'), a('unten', 2, 'tuer')] }], 'x', 3)!
    expect(m.vorderseite).toBe('unten')
  })
  it('senkrechte lange Achse: vorne/hinten sind links/rechts im Plan', () => {
    const m = oeffnungenFuerModell([{ ebene: 0, oeffnungen: [a('links', 2), a('rechts', 2), a('unten', 1)] }], 'y', 3)!
    expect(m.vorderseite).toBe('links')
    // Blick von Westen: Plan-Süden (y+) liegt rechts im Bild
    expect(m.fenster.map((f) => [f.side, f.offsetAlongM])).toEqual([['front', 2], ['back', 2], ['right', -1]])
  })
  it('Türen im Erdgeschoss mit Höhe aus dem Plan, Fenster mit Brüstung und Geschossbeginn', () => {
    const m = oeffnungenFuerModell([
      { ebene: 0, oeffnungen: [a('unten', 0, 'tuer', { bruestungM: 0, sturzM: 2.1 }), a('unten', 3, 'fenster', { bruestungM: 0.85, sturzM: 2.1 }), a('unten', -3, 'tuer', { bruestungM: -0.15, sturzM: 2.35 })] },
      { ebene: 1, oeffnungen: [a('unten', 2, 'fenster', { bruestungM: 0.85, sturzM: 2.2 }), a('unten', 5, 'tuer', { bruestungM: 0, sturzM: 2.2 })] },
    ], 'x', 2.96)!
    expect(m.tueren.map((t) => [t.side, t.offsetAlongM, t.widthM, t.heightM])).toEqual([['front', 0, 1.1, 2.1], ['front', -3, 1.1, 2.35]])
    expect(m.fenster[0]).toMatchObject({ floorIndex: 0, bottomY: 0.85, heightM: 1.25 })
    // Obergeschoss beginnt bei 2,96 m; die Balkontür wird als raumhohes Fenster gezeichnet
    expect(m.fenster[1]).toMatchObject({ floorIndex: 1, bottomY: 3.81, heightM: 1.35 })
    expect(m.fenster[2]).toMatchObject({ floorIndex: 1, bottomY: 2.96, heightM: 2.2 })
  })
  it('Keller zählt nicht; ohne Öffnungen kommt null', () => {
    expect(oeffnungenFuerModell([{ ebene: -1, oeffnungen: [a('unten', 0)] }], 'x', 3)).toBeNull()
    expect(oeffnungenFuerModell([], 'x', 3)).toBeNull()
  })
  it('ohne Brüstung und Sturz im Plan gelten Standardmaße', () => {
    const m = oeffnungenFuerModell([{ ebene: 0, oeffnungen: [a('unten', 1), a('unten', 3, 'tuer')] }], 'x', 3)!
    expect(m.fenster[0]).toMatchObject({ bottomY: 0.9, heightM: 1.4 })
    expect(m.tueren[0]).toMatchObject({ heightM: 2.1 })
  })
})

describe('Fenster mit fester Lage im Modell', () => {
  const gebaeude: BuildingParams = { lengthM: 20, widthM: 10, heightM: 6, eavesHeightM: 6, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [3, 3], windowCount: 12, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] }
  it('ohne feste Fenster werden die Fenster gleichmäßig verteilt', () => {
    expect(generateBuildingFeatures(gebaeude).filter((f) => f.type === 'window')).toHaveLength(12)
  })
  it('mit festen Fenstern entstehen genau diese, an ihrer Seite und Lage', () => {
    const fest = [
      { id: 'p0', side: 'back' as const, offsetAlongM: 2, bottomY: 0.9, widthM: 1.1, heightM: 1.4, floorIndex: 0 },
      { id: 'p1', side: 'right' as const, offsetAlongM: -1, bottomY: 3.8, widthM: 1, heightM: 1.2, floorIndex: 1 },
    ]
    const w = generateBuildingFeatures({ ...gebaeude, fensterFest: fest }).filter((f) => f.type === 'window')
    expect(w).toHaveLength(2)
    expect(w[0]).toMatchObject({ side: 'back', offsetAlongM: 2, bottomY: 0.9 })
    expect(w[1]).toMatchObject({ side: 'right', offsetAlongM: -1, floorIndex: 1 })
  })
})

describe('Vorbauten', () => {
  const vb = (x0: number, y0: number, x1: number, y1: number) => ({ laengeM: 4, tiefeM: 1.5, flaecheM2: 6, lage: { x0, y0, x1, y1 } })
  it('ordnet den Vorbau der Kante zu, über die er hinausragt, mit Tiefe und Lage ab Kantenmitte', () => {
    // Rechteck 20 × 10 m (je 5 cm je Punkt); Vorbau 6 m breit, 1,5 m tief über der Oberkante, 2 m rechts von der Mitte
    const r = vorbautenAnKanten([vb(260, -30, 380, 0)], rechteck, MPP)
    expect(r).toEqual([{ kante: 'oben', alongM: 6, breiteM: 6, tiefeM: 1.5 }])
  })
  it('erkennt Vorbauten an allen vier Kanten, ignoriert kleine Überstände und fehlende Lage', () => {
    const r = vorbautenAnKanten([vb(100, 200, 160, 240), vb(-40, 80, 0, 140), vb(400, 60, 440, 120), vb(10, 195, 50, 205), { laengeM: 1, tiefeM: 1, flaecheM2: 1 }], rechteck, MPP)
    expect(r.map((v) => v.kante)).toEqual(['unten', 'links', 'rechts'])
  })
  it('dreht den Vorbau mit dem Plan: Vorderseite oben macht aus der Oberkante die Vorderseite', () => {
    const v = [{ kante: 'oben' as const, alongM: 6, breiteM: 6, tiefeM: 1.5 }]
    expect(vorbautenFuerModell([{ ebene: 0, vorbauten: v }], 'unten', 3)[0]).toMatchObject({ side: 'back', offsetAlongM: 6, tiefeM: 1.5 })
    expect(vorbautenFuerModell([{ ebene: 0, vorbauten: v }], 'oben', 3)[0]).toMatchObject({ side: 'front', offsetAlongM: -6 })
  })
  it('derselbe Vorbau in zwei Geschossen ist ein Körper mit der Höhe beider Geschosse', () => {
    const e = [{ kante: 'oben' as const, alongM: 6, breiteM: 4.4, tiefeM: 1.5 }]
    const o = [{ kante: 'oben' as const, alongM: 2, breiteM: 4.4, tiefeM: 1.5 }]
    const r = vorbautenFuerModell([{ ebene: 0, vorbauten: e }, { ebene: 1, vorbauten: o }], 'unten', 2.96)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ offsetAlongM: 6, hoeheM: 5.92 })
  })
  it('ein Vorbau nur im Erdgeschoss ist ein Geschoss hoch; Keller zählt nicht', () => {
    const e = [{ kante: 'links' as const, alongM: 0, breiteM: 3, tiefeM: 1 }]
    expect(vorbautenFuerModell([{ ebene: 0, vorbauten: e }], 'unten', 2.9)[0].hoeheM).toBe(2.9)
    expect(vorbautenFuerModell([{ ebene: -1, vorbauten: e }], 'unten', 2.9)).toEqual([])
  })
  it('breite Terrassentür im EG wird wie ein Fenster behandelt (überbaubar), schmale Haustür bleibt frei', () => {
    const m = oeffnungenFuerModell([{ ebene: 0, oeffnungen: [a('unten', 0, 'tuer'), a('unten', 3, 'tuer', { breiteM: 2.4 })] }], 'x', 3)!
    expect(m.tueren.length).toBe(1)
    expect(m.fenster.length).toBe(1)
  })
})
