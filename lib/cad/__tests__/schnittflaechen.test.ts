import { describe, it, expect } from 'vitest'
import { koerperAusSchnittflaechen } from '../schnittflaechen'
import type { VektorFlaeche } from '../pdf-vektoren'

const MPP = (0.0254 / 72) * 100
const px = (m: number) => m / MPP
const rechteck = (x0m: number, y0m: number, x1m: number, y1m: number, fill = '#808080'): VektorFlaeche => ({
  fill, ringe: [[[px(x0m), px(y0m)], [px(x1m), px(y0m)], [px(x1m), px(y1m)], [px(x0m), px(y1m)]]], bbox: [px(x0m), px(y0m), px(x1m), px(y1m)],
})

describe('koerperAusSchnittflaechen', () => {
  it('fasst zwei Wandflächen mit Türöffnung zu einem Körper zusammen, Anbau abseits bleibt draußen', () => {
    const fl = [rechteck(11, 7, 16, 16.7), rechteck(17.5, 7, 22.6, 16.7), rechteck(30, 5, 32.7, 8)]
    const k = koerperAusSchnittflaechen(fl, 100)!
    expect(k.breiteM).toBeCloseTo(11.6, 1)
    expect(k.tiefeM).toBeCloseTo(9.7, 1)
    expect(k.anzahlFlaechen).toBe(2)
    expect(k.hinweise.join(' ')).toMatch(/1 weitere Gruppe/)
  })
  it('weiße Flächen, Linien und kleine Symbole zählen nicht', () => {
    const fl = [rechteck(0, 0, 10, 10, '#ffffff'), rechteck(0, 0, 0.5, 0.5), { ...rechteck(0, 0, 8, 8), linie: true }]
    expect(koerperAusSchnittflaechen(fl, 100)).toBeNull()
  })
  it('bestätigte Maßkette, die zur Breite passt, wird genannt; ohne Treffer steht ein Hinweis', () => {
    const fl = [rechteck(0, 0, 9.32, 8)]
    const mit = koerperAusSchnittflaechen(fl, 100, [{ text: '9,32', textM: 9.32, linieM: 9.322, richtung: 'waagerecht', status: 'bestaetigt', x: 0, y: 0 }])!
    expect(mit.passendeMasse).toEqual([{ text: '9,32', linieM: 9.322, passtZu: 'breite' }])
    const ohne = koerperAusSchnittflaechen(fl, 100, [])!
    expect(ohne.hinweise.join(' ')).toMatch(/Keine bestätigte Maßkette/)
  })
  it('Grau wird gegenüber einer größeren bunten Fläche bevorzugt; kein Maßstab = kein Ergebnis', () => {
    const fl = [rechteck(0, 0, 20, 20, '#fa8c00'), rechteck(2, 2, 8, 8)]
    expect(koerperAusSchnittflaechen(fl, 100)!.fill).toBe('#808080')
    expect(koerperAusSchnittflaechen(fl, 0)).toBeNull()
  })
})

describe('Anhängsel', () => {
  it('ein kleiner Wandstummel nahe am Körper vergrößert die Hülle nicht', () => {
    const fl = [rechteck(11, 7, 16, 16.7), rechteck(17.5, 7, 22.6, 16.7), rechteck(7, 5.8, 10, 8.2)]
    const k = koerperAusSchnittflaechen(fl, 100)!
    expect(k.breiteM).toBeCloseTo(11.6, 1)
    expect(k.anzahlFlaechen).toBe(2)
    expect(k.hinweise.join(' ')).toMatch(/kleine Fläche/)
  })
})
