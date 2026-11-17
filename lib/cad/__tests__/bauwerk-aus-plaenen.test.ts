import { describe, it, expect } from 'vitest'
import { bauwerkAusPlaenen } from '../bauwerk-aus-plaenen'

const MS = 100
const mm = (m: number) => m / (0.0254 / 72) / MS
const rect = (fill: string, x0: number, y0: number, x1: number, y1: number) => ({ fill, ringe: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]], bbox: [x0, y0, x1, y1] as [number, number, number, number] })

describe('bauwerkAusPlaenen', () => {
  it('Grundriss + Ansicht: Maße vorgeschlagen, Abweichung wird gemeldet', () => {
    const gr = { name: 'Grundriss.pdf', massstab: MS, texte: [{ s: 'GRUNDRISS EG', x: 0, y: 0 }, { s: 'M 1:100', x: 0, y: 10 }], flaechen: [rect('#808080', 0, 0, mm(10), mm(8)) as any] }
    const r = bauwerkAusPlaenen([gr as any])
    expect(r.laengeM).toBeCloseTo(10, 0)
    expect(r.breiteM).toBeCloseTo(8, 0)
    expect(r.hoeheM).toBeUndefined()
    expect(r.befunde.map((b) => b.code)).toContain('KEINE_ANSICHT')
    expect(r.befunde.map((b) => b.code)).toContain('GRUNDRISS_UNBESTAETIGT')
  })
  it('unbekannte Seite landet in nichtGelesen', () => {
    const r = bauwerkAusPlaenen([{ name: 'x.pdf', massstab: MS, texte: [{ s: 'Deckblatt', x: 0, y: 0 }], flaechen: [] }])
    expect(r.nichtGelesen[0]).toMatch(/x\.pdf/)
    expect(r.laengeM).toBeUndefined()
  })
})

describe('Turmprofil im Vorschlag', () => {
  const mm2 = (m: number) => m / (0.0254 / 72) / 100
  const boden = 900, cx = 300
  const rect = (fill: string, y0: number, y1: number, b: number) => ({ fill, ringe: [[[cx - mm2(b) / 2, boden - mm2(y1)], [cx + mm2(b) / 2, boden - mm2(y1)], [cx + mm2(b) / 2, boden - mm2(y0)], [cx - mm2(b) / 2, boden - mm2(y0)]]], bbox: [cx - mm2(b) / 2, boden - mm2(y1), cx + mm2(b) / 2, boden - mm2(y0)] as [number, number, number, number] })
  it('Ansicht mit Tür am Boden: Schaft und Helm im Vorschlag, Maßkette im Grundriss stützt die Helmbreite', () => {
    const tuer = { fill: '#000000', ringe: [[[cx - mm2(0.5), boden - mm2(2.2)], [cx + mm2(0.5), boden - mm2(2.2)], [cx + mm2(0.5), boden], [cx - mm2(0.5), boden]]], bbox: [cx - mm2(0.5), boden - mm2(2.2), cx + mm2(0.5), boden] as [number, number, number, number] }
    const ans = { name: 'a.pdf', massstab: 100, texte: [{ s: 'ANSICHT WEST', x: 0, y: 0 }, { s: 'M 1:100', x: 0, y: 5 }], flaechen: [rect('#37bfff', 0, 30, 10), rect('#fb8c00', 30, 40, 6), tuer] as any }
    const r = bauwerkAusPlaenen([ans])
    expect(r.turmProfil?.helmHoeheM).toBeGreaterThan(8)
    expect(r.befunde.map((b) => b.code)).toContain('TURM_PROFIL')
  })
})
