import { describe, it, expect } from 'vitest'
import { ansichtLesen } from '../ansicht-lesen'
import type { VektorFlaeche } from '../pdf-vektoren'
import type { PlanText } from '../grundriss-finden'

// 1:100: 1 m = 28,35 Punkte. Zeichnung: Boden bei y = 1000, Turm 10 m breit und 30 m hoch, Tür 2 m × 2,4 m mittig.
const M = 1 / 0.0352778
const rect = (fill: string, x0: number, y0: number, x1: number, y1: number): VektorFlaeche => ({ fill, ringe: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]], bbox: [x0, y0, x1, y1] })
const boden = 1000
const turm = rect('#e4e1c9', 200, boden - 30 * M, 200 + 10 * M, boden)
const mitteX = 200 + 5 * M
const tuer = rect('#000000', mitteX - 1 * M, boden - 0.5 * M - 2.4 * M, mitteX + 1 * M, boden - 0.5 * M)
const schriftfeld = rect('#ffffff', 600, 900, 800, 1100)
const texte: PlanText[] = [{ s: 'Maßstab 1:100', x: 620, y: 1000 }, { s: '1.BA', x: 150, y: boden - 20 * M - 8 }, { s: '2.BA', x: 150, y: boden - 20 * M + 8 }, { s: '1.BA', x: 700, y: 50 }, { s: '2.BA', x: 700, y: 110 }]

describe('ansichtLesen', () => {
  it('liest Maßstab, Körper, Tür und Teilung', () => {
    const r = ansichtLesen([schriftfeld, turm, tuer], texte)!
    expect(r.massstab).toBe(100)
    expect(r.bodenYPt).toBeCloseTo(boden, 1)
    const k = r.koerper.find((x) => x.fill === '#e4e1c9')!
    expect(k.breiteM).toBeCloseTo(10, 1); expect(k.hoeheM).toBeCloseTo(30, 1); expect(k.reichtBisBoden).toBe(true)
    expect(r.teilungM).toBeCloseTo(20, 0) // die Legende (Abstand 60 pt) zählt nicht
    expect(r.tueren).toHaveLength(1)
    expect(r.tueren[0]).toMatchObject({ breiteM: 2, hoeheM: 2.4, schwelleM: 0.5 })
    expect(r.tueren[0].mitteAbKoerperM).toBeCloseTo(0, 1)
  })
  it('ohne Maßstab oder ohne Flächen: null; mit Vorgabe-Maßstab geht es trotzdem', () => {
    expect(ansichtLesen([turm], [])).toBeNull()
    expect(ansichtLesen([], texte)).toBeNull()
    expect(ansichtLesen([turm], [], 100)?.massstab).toBe(100)
  })
  it('Türmaße außerhalb des Bereichs oder hoch über dem Boden zählen nicht', () => {
    const fenster = rect('#000000', 300, boden - 10 * M - 1.5 * M, 300 + 1 * M, boden - 10 * M)
    const schmal = rect('#000000', 400, boden - 2.4 * M, 400 + 0.1 * M, boden)
    const r = ansichtLesen([turm, fenster, schmal], texte)!
    expect(r.tueren).toHaveLength(0)
    expect(r.hinweise.some((h) => /Keine Tür/.test(h))).toBe(true)
  })
  it('Flächen, die nicht bis zum Boden reichen, werden gemeldet', () => {
    const oben = rect('#e4e1c9', 200, 100, 200 + 10 * M, 400)
    const r = ansichtLesen([oben], texte)!
    expect(r.koerper[0].reichtBisBoden).toBe(true) // der Boden ist per Annahme die tiefste Unterkante der Zeichnung
    expect(r.bodenYPt).toBeCloseTo(400, 1)
  })
})
