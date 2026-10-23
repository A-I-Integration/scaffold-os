import { describe, it, expect } from 'vitest'
import { baueStabwerk, type StabwerkBauteil } from '../stabwerk'

const b = (o: Partial<StabwerkBauteil> & { type: string }): StabwerkBauteil => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], ...o })

describe('baueStabwerk', () => {
  it('Rahmen mit Breite: 2 Stiele + 3 Sprossen (ab 1,4 m Höhe), Knoten dedupliziert', () => {
    const s = baueStabwerk([b({ type: 'frame', rahmenBreiteM: 0.73, scale: [0.073, 2, 0.04], position: [10, 1, 5] })])
    expect(s.staebe.filter((x) => x.art === 'stiel')).toHaveLength(2)
    expect(s.staebe.filter((x) => x.art === 'riegel')).toHaveLength(3)
    const stiel = s.staebe.find((x) => x.art === 'stiel')!
    expect(stiel.a[0]).toBe(10); expect(stiel.a[1]).toBe(0); expect(stiel.b[1]).toBe(2)
    expect(s.knoten).toHaveLength(10) // 4 Stielenden + 6 Sprossenenden
  })
  it('niedriger Rahmen (< 1,4 m): nur 2 Sprossen', () => {
    const s = baueStabwerk([b({ type: 'frame', rahmenBreiteM: 0.73, scale: [0.073, 1, 0.04] })])
    expect(s.staebe.filter((x) => x.art === 'riegel')).toHaveLength(2)
  })
  it('Diagonale liegt auf der längsten Achse und folgt der Drehung', () => {
    const s = baueStabwerk([b({ type: 'diagonal', scale: [3, 0.03, 0.03], rotation: [0, 0, Math.PI / 2], position: [0, 1, 0] })])
    expect(s.staebe).toHaveLength(1)
    const { a, b: e } = s.staebe[0]
    expect(Math.abs(a[0])).toBeLessThan(1e-6); expect(Math.abs(e[0])).toBeLessThan(1e-6)
    expect(Math.abs(a[1] - e[1])).toBeCloseTo(3, 3)
    expect(s.staebe[0].art).toBe('diagonale')
  })
  it('Belag: 4 Randstäbe und 2 Dreiecke; Treppenstufe ohne Fläche', () => {
    const s = baueStabwerk([b({ type: 'deck', scale: [2.5, 0.7, 0.02] })])
    expect(s.staebe.filter((x) => x.art === 'belag')).toHaveLength(4)
    expect(s.knoten).toHaveLength(0) // Belag und Geländer erzeugen keine eigenen Knoten
    expect(s.flaechen).toHaveLength(18)
    const t = baueStabwerk([b({ type: 'deck', articleNumber: 'ST-001', scale: [1, 0.3, 0.02] })])
    expect(t.flaechen).toHaveLength(0)
  })
  it('Kupplungen/Fußplatten nur als Knoten; Netze und Planen gar nicht', () => {
    const s = baueStabwerk([b({ type: 'coupling', position: [1, 2, 3] }), b({ type: 'footplate', position: [1, 2, 3] }), b({ type: 'net' }), b({ type: 'sheeting' })])
    expect(s.staebe).toHaveLength(0)
    expect(s.knoten).toEqual([[1, 2, 3]])
  })
  it('Geländerfeld: Handlauf und Zwischenholm; Pfosten als senkrechter Stab', () => {
    expect(baueStabwerk([b({ type: 'railing', scale: [2.5, 1, 0.04] })]).staebe).toHaveLength(2)
    const p = baueStabwerk([b({ type: 'railing', scale: [0.04, 1, 0.04] })])
    expect(p.staebe).toHaveLength(1)
  })
})
