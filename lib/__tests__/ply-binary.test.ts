import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { istBinaerPly, parsePlyBinary } from '../ply-binary'

// Worker-Kopie (CommonJS) – muss sich identisch verhalten
const require = createRequire(import.meta.url)
const worker = require('../../workers/punktwolke/ply-binary.js') as { istBinaerPly: (b: Buffer) => boolean; parsePlyBinary: (b: Buffer) => number[] }

const PUNKTE: [number, number, number][] = [[0, 0, 0], [1.5, 2.25, -3], [10, 0.5, 4.75], [-2, 8, 1]]

function baue(opts: { little?: boolean; faces?: boolean; typ?: 'float' | 'double'; farbe?: boolean; davor?: boolean } = {}): Buffer {
  const little = opts.little !== false
  const typ = opts.typ ?? 'float'
  const g = typ === 'double' ? 8 : 4
  const kopf = [
    'ply',
    `format binary_${little ? 'little' : 'big'}_endian 1.0`,
    'comment erzeugt im Test',
    ...(opts.davor ? ['element camera 2', 'property float a', 'property float b'] : []),
    `element vertex ${PUNKTE.length}`,
    `property ${typ} x`, `property ${typ} y`, `property ${typ} z`,
    ...(opts.farbe ? ['property uchar red', 'property uchar green', 'property uchar blue'] : []),
    ...(opts.faces ? ['element face 1', 'property list uchar int vertex_indices'] : []),
    'end_header',
  ].join('\n') + '\n'
  const teile: Buffer[] = [Buffer.from(kopf, 'latin1')]
  if (opts.davor) { const b = Buffer.alloc(16); teile.push(b) } // 2 × (2 float) = 16 Byte Füllung
  for (const p of PUNKTE) {
    const b = Buffer.alloc(g * 3 + (opts.farbe ? 3 : 0))
    p.forEach((v, i) => {
      if (typ === 'double') (little ? b.writeDoubleLE : b.writeDoubleBE).call(b, v, i * 8)
      else (little ? b.writeFloatLE : b.writeFloatBE).call(b, v, i * 4)
    })
    if (opts.farbe) { b[g * 3] = 255; b[g * 3 + 1] = 128; b[g * 3 + 2] = 0 }
    teile.push(b)
  }
  if (opts.faces) teile.push(Buffer.from([3, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0]))
  return Buffer.concat(teile)
}

const erwartet = PUNKTE.flat()

describe.each([['TypeScript', { istBinaerPly, parsePlyBinary }], ['Worker-JS', worker]])('binäres PLY (%s)', (_n, impl) => {
  it('liest little endian float', () => { expect(impl.parsePlyBinary(baue())).toEqual(erwartet) })
  it('liest big endian float', () => { expect(impl.parsePlyBinary(baue({ little: false }))).toEqual(erwartet) })
  it('liest double', () => { expect(impl.parsePlyBinary(baue({ typ: 'double' }))).toEqual(erwartet) })
  it('überspringt Farben und Flächen', () => { expect(impl.parsePlyBinary(baue({ farbe: true, faces: true }))).toEqual(erwartet) })
  it('überspringt feste Elemente vor den Punkten', () => { expect(impl.parsePlyBinary(baue({ davor: true }))).toEqual(erwartet) })
  it('erkennt binär vs. ASCII', () => {
    expect(impl.istBinaerPly(baue())).toBe(true)
    expect(impl.istBinaerPly(Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nend_header\n0 0 0\n'))).toBe(false)
  })
  it('kürzt bei abgeschnittener Datei auf vorhandene Punkte', () => {
    const b = baue()
    expect(impl.parsePlyBinary(b.subarray(0, b.length - 8)).length).toBe(9)
  })
  it('gibt verständliche Fehler', () => {
    expect(() => impl.parsePlyBinary(Buffer.from('ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nproperty float y\nend_header\n'))).toThrow(/x, y, z/)
    expect(() => impl.parsePlyBinary(Buffer.from('kein ply'))).toThrow(/end_header/)
  })
})
