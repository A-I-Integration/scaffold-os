import { describe, it, expect } from 'vitest'
import { maskeAusreisser, maskeBox, maskeHoeheBis, messeFlaeche, messeStrecke, wendeMaskeAn, zaehleMaske, formatM } from '@/lib/cad/punktwolke-werkzeuge'

const block = (x0: number, y0: number, z0: number, l: number, b: number, h: number, d = 0.1): number[] => { const p: number[] = []; for (let x = 0; x <= l; x += d) for (let y = 0; y <= b; y += d) for (let z = 0; z <= h; z += d) p.push(x0 + x, y0 + y, z0 + z); return p }

describe('Bereinigen', () => {
  it('Box behält nur Punkte innen', () => {
    const p = [0, 0, 0, 5, 5, 5, 10, 10, 10]
    expect(Array.from(maskeBox(p, { minX: -1, maxX: 6, minY: -1, maxY: 6 }))).toEqual([1, 1, 0])
    expect(Array.from(maskeBox(p, { minX: -1, maxX: 11, minY: -1, maxY: 11, minZ: 1, maxZ: 6 }))).toEqual([0, 1, 0])
  })
  it('Streupunkte fliegen raus, das Gebäude bleibt vollständig', () => {
    const haus = block(0, 0, 0, 3, 3, 3)
    const streu = [20, 20, 20, -15, 7, 9, 3.05, 40, 1, 12, -12, 30]
    const p = [...haus, ...streu]
    const m = maskeAusreisser(p, { zelleM: 0.3, minPunkte: 8 })
    const nHaus = haus.length / 3
    expect(zaehleMaske(m.subarray(0, nHaus))).toBe(nHaus)
    expect(zaehleMaske(m.subarray(nHaus))).toBe(0)
  })
  it('Höhe begrenzen', () => {
    const m = maskeHoeheBis([0, 0, 1, 0, 0, 5, 0, 0, 9], 5)
    expect(Array.from(m)).toEqual([1, 1, 0])
  })
  it('Maske wirkt auf Positionen und Farben gleich', () => {
    const r = wendeMaskeAn(Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]), Uint8Array.from([10, 11, 12, 20, 21, 22, 30, 31, 32]), Uint8Array.from([1, 0, 1]))
    expect(Array.from(r.positionen)).toEqual([1, 2, 3, 7, 8, 9])
    expect(Array.from(r.farben)).toEqual([10, 11, 12, 30, 31, 32])
  })
  it('leere Eingabe: leere Maske', () => { expect(maskeAusreisser([]).length).toBe(0) })
})

describe('Messen', () => {
  it('Strecke: räumlich, waagerecht, Höhe', () => {
    const s = messeStrecke([0, 0, 0], [3, 4, 12])
    expect(s.waagerechtM).toBeCloseTo(5, 9); expect(s.hoeheM).toBeCloseTo(12, 9); expect(s.raeumlichM).toBeCloseTo(13, 9)
  })
  it('Fläche und Umfang eines Rechtecks, unabhängig von der Richtung', () => {
    const r = messeFlaeche([[0, 0], [12, 0], [12, 8], [0, 8]])
    expect(r.flaecheM2).toBeCloseTo(96, 9); expect(r.umfangM).toBeCloseTo(40, 9)
    expect(messeFlaeche([[0, 8], [12, 8], [12, 0], [0, 0]]).flaecheM2).toBeCloseTo(96, 9)
  })
  it('L-Form', () => { expect(messeFlaeche([[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]).flaecheM2).toBeCloseTo(64, 9) })
  it('weniger als 3 Punkte: Fläche 0', () => { expect(messeFlaeche([[0, 0], [3, 4]]).flaecheM2).toBe(0); expect(messeFlaeche([[0, 0], [3, 4]]).umfangM).toBeCloseTo(5, 9) })
  it('Zahlenformat deutsch', () => { expect(formatM(12.345)).toBe('12,35') })
})
