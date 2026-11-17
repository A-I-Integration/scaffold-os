import { describe, it, expect } from 'vitest'
import { lesMassketten, massZahl } from '../masse-lesen'
import type { VektorFlaeche } from '../pdf-vektoren'

const MPP = (0.0254 / 72) * 100 // Meter je Punkt bei 1:100
const linieH = (x: number, y: number, m: number): VektorFlaeche => ({ fill: '#000000', linie: true, ringe: [[[x, y], [x + m / MPP, y]]], bbox: [x, y, x + m / MPP, y] })
const linieV = (x: number, y: number, m: number): VektorFlaeche => ({ fill: '#000000', linie: true, ringe: [[[x, y], [x, y + m / MPP]]], bbox: [x, y, x, y + m / MPP] })

describe('massZahl', () => {
  it('liest Meterzahlen und Millimeter-Angaben, sonst nichts', () => {
    expect(massZahl('9,322')).toBe(9.322)
    expect(massZahl('1,02')).toBe(1.02)
    expect(massZahl('9.137mm')).toBe(9.137)
    expect(massZahl('5.040mm')).toBe(5.04)
    expect(massZahl('+5,92')).toBeNull()
    expect(massZahl('611')).toBeNull()
    expect(massZahl('1:100')).toBeNull()
  })
})

describe('lesMassketten', () => {
  it('bestätigt ein gerundetes Maß über die gezeichnete Linie und nimmt deren genauere Länge', () => {
    const r = lesMassketten([linieH(100, 100, 1.025)], [{ s: '1,02', x: 130, y: 96 }], 100)
    expect(r.angaben[0]).toMatchObject({ status: 'bestaetigt', richtung: 'waagerecht', textM: 1.02 })
    expect(r.angaben[0].linieM).toBeCloseTo(1.025, 2)
  })
  it('senkrechte Maßlinie wird gefunden, Zahl ohne passende Linie bleibt „ohne Linie“', () => {
    const r = lesMassketten([linieV(50, 50, 4.86)], [{ s: '4,86', x: 46, y: 90 }, { s: '7,77', x: 46, y: 90 }], 100)
    expect(r.angaben.map((a) => a.status)).toEqual(['bestaetigt', 'ohne_linie'])
    expect(r.angaben[1].linieM).toBeUndefined()
  })
  it('weit entfernte Linie zählt nicht', () => {
    const r = lesMassketten([linieH(100, 100, 2.5)], [{ s: '2,50', x: 100 + 20 / MPP, y: 100 }], 100)
    expect(r.angaben[0].status).toBe('ohne_linie')
  })
  it('erkennt einen falschen Maßstab: Linien passen bei 1:50 statt 1:100', () => {
    const werte = [2.0, 3.0, 4.0, 5.0, 2.5, 3.5]
    const fl = werte.map((v, i) => linieH(50, 40 + i * 120, v / 2)) // mit 1:100 gezeichnet wären sie halb so lang
    const texte = werte.map((v, i) => ({ s: v.toFixed(2).replace('.', ','), x: 60, y: 36 + i * 120 }))
    const r = lesMassketten(fl, texte, 100)
    expect(r.besterMassstab).toBe(200)
    expect(r.bestaetigt).toBe(0)
  })
  it('läuft ohne Texte und ohne Vektoren', () => {
    expect(lesMassketten([], [], 100).angaben).toEqual([])
  })
})
