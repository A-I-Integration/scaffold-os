import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseE57, parsePtx } = require('../../workers/punktwolke/xyz-e57.js')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { analysiere } = require('../../workers/punktwolke/analyse.js')
import { readFileSync } from 'fs'
import { join } from 'path'

const lies = (n: string) => readFileSync(join(__dirname, '../../workers/punktwolke/testdaten', n))
const ID = ['1 0 0 0', '0 1 0 0', '0 0 1 0', '0 0 0 1']
/** Ein Scan im PTX-Aufbau: Spalten, Zeilen, Position, drei Achsen, Matrix, Punktzeilen */
const scan = (punkte: string[], matrix: string[] = ID, spalten = punkte.length, zeilen = 1) =>
  [String(spalten), String(zeilen), '0 0 0', '1 0 0', '0 1 0', '0 0 1', ...matrix, ...punkte].join('\n')
const buf = (...scans: string[]) => Buffer.from(scans.join('\n') + '\n', 'latin1')

describe('PTX (Leica) lesen', () => {
  it('ein Scan mit Einheitsmatrix: Punkte unverändert, Intensität und Farbe werden ignoriert', () => {
    const p: Float64Array = parsePtx(buf(scan(['1 2 3 0.5', '4 5 6 0.5 10 20 30', '7 8 9 0.1'])))
    expect(Array.from(p)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('Matrix wird als Zeilenvektor · M angewendet (Drehung 90° um z, Verschiebung 10 / 20 / 30 in der letzten Zeile)', () => {
    // [x y z 1] · M mit M = Rz(90°)ᵀ-artig: x' = −y + 10, y' = x + 20, z' = z + 30
    const M = ['0 1 0 0', '-1 0 0 0', '0 0 1 0', '10 20 30 1']
    const p: Float64Array = parsePtx(buf(scan(['1 0 0 0.5', '0 1 0 0.5', '0 0 1 0.5'], M)))
    expect(Array.from(p)).toEqual([10, 21, 30, 9, 20, 30, 10, 20, 31])
  })
  it('mehrere Scans in einer Datei werden mit je eigener Matrix zusammengeführt', () => {
    const a = scan(['1 1 1 0.5', '2 2 2 0.5', '3 3 3 0.5'])
    const b = scan(['0 0 1 0.5', '0 1 1 0.5', '1 1 1 0.5'], ['1 0 0 0', '0 1 0 0', '0 0 1 0', '100 0 0 1'])
    const p: Float64Array = parsePtx(buf(a, b))
    expect(p.length / 3).toBe(6)
    expect(p[9]).toBe(100); expect(p[12]).toBe(100); expect(p[15]).toBe(101)
  })
  it('ungültige Punkte (0 0 0) werden übersprungen', () => {
    const p: Float64Array = parsePtx(buf(scan(['0 0 0 0.5', '1 2 3 0.5', '0 0 0 0.5', '4 5 6 0.5', '7 8 9 0.5'])))
    expect(Array.from(p)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('Spalten × Zeilen: Scan mit 2 × 2 Punkten, danach beginnt der nächste Scan', () => {
    const p: Float64Array = parsePtx(buf(scan(['1 1 1 0', '2 2 2 0', '3 3 3 0', '4 4 4 0'], ID, 2, 2), scan(['5 5 5 0', '6 6 6 0', '7 7 7 0'])))
    expect(p.length / 3).toBe(7)
  })
  it('abgeschnittene Datei: gelesen wird, was da ist', () => {
    const text = scan(['1 1 1 0', '2 2 2 0', '3 3 3 0', '4 4 4 0'], ID, 4, 1).split('\n').slice(0, -1).join('\n')
    const p: Float64Array = parsePtx(Buffer.from(text, 'latin1'))
    expect(p.length / 3).toBe(3)
  })
  it('verständliche Meldungen: kein PTX-Kopf, Matrix kaputt, keine gültigen Punkte', () => {
    expect(() => parsePtx(Buffer.from('Hallo\nWelt\n'))).toThrow(/Kopf nicht lesbar/)
    expect(() => parsePtx(Buffer.from('2\n1\n0 0 0\n1 0 0\n0 1 0\n0 0 1\na b c d\n'))).toThrow(/Matrix/)
    expect(() => parsePtx(buf(scan(['0 0 0 0', '0 0 0 0', '0 0 0 0'])))).toThrow(/keine gültigen Punkte/)
  })
  it('Ende-zu-Ende: PTX-Haus (aus der E57-Testdatei, Matrix verschiebt um 500 m) ergibt dieselben Maße', () => {
    const e = parseE57(lies('klein-haus.e57')) as Float64Array
    const zeilen = Array.from({ length: e.length / 3 }, (_, i) => `${(e[i * 3] - 500).toFixed(3)} ${e[i * 3 + 1].toFixed(3)} ${e[i * 3 + 2].toFixed(3)} 0.5`)
    const m = analysiere(buf(scan(zeilen, ['1 0 0 0', '0 1 0 0', '0 0 1 0', '500 0 0 1'])), 'ptx')
    const ref = analysiere(Buffer.from(Array.from({ length: e.length / 3 }, (_, i) => `${e[i * 3].toFixed(3)} ${e[i * 3 + 1].toFixed(3)} ${e[i * 3 + 2].toFixed(3)} 1`).join('\n')), 'xyz')
    expect(m.verticalAxis).toBe('z')
    expect(m.heightM).toBeCloseTo(ref.heightM, 1)
    expect(m.heightM).toBeGreaterThan(8.0); expect(m.heightM).toBeLessThan(9.0)
  })
})
