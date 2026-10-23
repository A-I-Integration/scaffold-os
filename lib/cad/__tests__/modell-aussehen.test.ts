import { describe, it, expect } from 'vitest'
import { aussehenAusDatei, aussehenAusPly, istGlb } from '../modell-aussehen'

const buf = (b: Uint8Array | Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const asciiPly = (zeilen: string[], extra = '') =>
  buf(Buffer.from(`ply\nformat ascii 1.0\ncomment x\nelement vertex ${zeilen.length}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\n${extra}end_header\n${zeilen.join('\n')}\n`, 'latin1'))

describe('Aussehen: PLY', () => {
  it('liest ASCII-PLY mit Farben', () => {
    const r = aussehenAusDatei(asciiPly(['1 2 3 10 20 30', '4 5 6 40 50 60']), 'k.ply')
    expect(r.ok).toBe(true)
    if (r.ok && r.aussehen.art === 'punkte') {
      expect(Array.from(r.aussehen.positionen)).toEqual([1, 2, 3, 4, 5, 6])
      expect(Array.from(r.aussehen.farben)).toEqual([10, 20, 30, 40, 50, 60])
    }
  })
  it('liest binäres PLY (little endian)', () => {
    const kopf = 'ply\nformat binary_little_endian 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n'
    const k = Buffer.from(kopf, 'latin1')
    const d = Buffer.alloc(30)
    ;[[1, 2, 3, 9, 8, 7], [4, 5, 6, 1, 2, 3]].forEach((p, i) => { p.slice(0, 3).forEach((v, j) => d.writeFloatLE(v, i * 15 + j * 4)); p.slice(3).forEach((v, j) => d.writeUInt8(v, i * 15 + 12 + j)) })
    const r = aussehenAusPly(buf(Buffer.concat([k, d])), 'b.ply')
    expect(r.ok && r.aussehen.art === 'punkte' && Array.from(r.aussehen.farben)).toEqual([9, 8, 7, 1, 2, 3])
  })
  it('lehnt PLY ohne Farben, mit Flächen und unvollständige Dateien ehrlich ab', () => {
    const ohne = buf(Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n'))
    const a = aussehenAusDatei(ohne, 'x.ply'); expect(a.ok).toBe(false); if (!a.ok) expect(a.meldung).toContain('Farben')
    const flaechen = buf(Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nproperty list uchar int vertex_index\nend_header\n1 2 3 0\n'))
    expect(aussehenAusDatei(flaechen, 'x.ply').ok).toBe(false)
    expect(aussehenAusDatei(asciiPly(['1 2 3 10 20']), 'x.ply').ok).toBe(false)
    expect(aussehenAusDatei(buf(Buffer.from('quatsch ohne Format irgendwas lang genug')), 'x.txt').ok).toBe(false)
  })
  it('erkennt GLB am Kopf', () => {
    const b = Buffer.alloc(24); b.write('glTF', 0, 'latin1')
    expect(istGlb(buf(b))).toBe(true)
    expect(istGlb(buf(Buffer.alloc(24)))).toBe(false)
    expect(aussehenAusDatei(buf(b), 'k.glb').ok).toBe(true)
  })
})

import { speicherImArbeitsspeicher, merkeAussehen, ladeGemerktesAussehen, vergissAussehen } from '../modell-speicher'

describe('Aussehen merken', () => {
  it('speichert und lädt Punktwolke samt Versatz, vergisst auf Wunsch', async () => {
    const sp = speicherImArbeitsspeicher()
    const a = { art: 'punkte' as const, name: 'k', positionen: new Float32Array([1, 2, 3]), farben: new Uint8Array([1, 2, 3]) }
    expect(await merkeAussehen({ aussehen: a, einheit: 'cm', oben: 'z', versatz: { x: 5, z: -2, grad: 90 } }, sp)).toBe(true)
    const g = await ladeGemerktesAussehen(sp)
    expect(g?.einheit).toBe('cm'); expect(g?.oben).toBe('z'); expect(g?.versatz).toEqual({ x: 5, z: -2, grad: 90 })
    await vergissAussehen(sp)
    expect(await ladeGemerktesAussehen(sp)).toBeNull()
  })
})
