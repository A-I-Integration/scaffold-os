import { describe, expect, it } from 'vitest'
import { oeffnungenFinden } from '../oeffnungen-aus-plan'
import type { GefundenerGrundriss } from '../grundriss-finden'
import type { VektorFlaeche } from '../pdf-vektoren'

const M = 0.01 // 1 pt = 1 cm
const rect = (x0: number, y0: number, x1: number, y1: number): number[][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const kontur = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }, { x: 0, y: 800 }]
const g: GefundenerGrundriss = { titel: 'EG', ebene: 0, kontur, farbe: '#ff8000', breiteM: 10, tiefeM: 8, flaecheM2: 80 }
// Wand 20 cm stark; obere Wand mit Lücke 300–420 (1,2 m), rechte Wand mit Lücke 300–500 (2 m)
const wand = (ringe: number[][][]): VektorFlaeche => ({ fill: '#ff8000', ringe, bbox: [0, 0, 1000, 800] })
const wandFl = wand([
  rect(0, 0, 300, 20), rect(420, 0, 1000, 20),
  rect(0, 780, 1000, 800), rect(0, 0, 20, 800),
  rect(980, 0, 1000, 300), rect(980, 500, 1000, 800),
])

describe('oeffnungenFinden', () => {
  it('findet Lücken in der Außenwand mit Breite', () => {
    const r = oeffnungenFinden([wandFl], g, [], M)
    expect(r.map((o) => o.breiteM).sort()).toEqual([1.2, 2])
  })
  it('ordnet FPH und STUK zu; Boden bis 2,1 m = Tür', () => {
    const texte = [{ s: 'FPH +0,00 m', x: 360, y: 60 }, { s: 'STUK +2,10 m', x: 360, y: 70 }, { s: 'FPH +0,85 m', x: 900, y: 400 }, { s: 'STUK +2,10 m', x: 900, y: 410 }]
    const r = oeffnungenFinden([wandFl], g, texte, M)
    const oben = r.find((o) => o.breiteM === 1.2)!
    const rechts = r.find((o) => o.breiteM === 2)!
    expect(oben).toMatchObject({ typ: 'tuer', bruestungM: 0, sturzM: 2.1 })
    expect(rechts).toMatchObject({ typ: 'fenster', bruestungM: 0.85, sturzM: 2.1 })
  })
  it('geschlossene Wand: keine Öffnung', () => {
    const zu = wand([rect(0, 0, 1000, 20), rect(0, 780, 1000, 800), rect(0, 0, 20, 800), rect(980, 0, 1000, 800)])
    expect(oeffnungenFinden([zu], g, [], M)).toEqual([])
  })
  it('Lücken über 6 m (offene Seite) zählen nicht', () => {
    const offen = wand([rect(0, 0, 1000, 20), rect(0, 780, 1000, 800), rect(0, 0, 20, 100), rect(0, 750, 20, 800), rect(980, 0, 1000, 800)])
    expect(oeffnungenFinden([offen], g, [], M)).toEqual([])
  })
})
