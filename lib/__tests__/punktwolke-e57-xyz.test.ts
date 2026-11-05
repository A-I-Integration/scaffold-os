import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseE57, parseXyz } = require('../../workers/punktwolke/xyz-e57.js')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { analysiere } = require('../../workers/punktwolke/analyse.js')

const lies = (n: string) => readFileSync(join(__dirname, '../../workers/punktwolke/testdaten', n))

// ─── Eine E57-Datei von Hand bauen (Seiten à 1020 Byte Inhalt + 4 Byte Prüfsumme), um Zahlenformate zu prüfen, die die Referenzdatei nicht abdeckt ───
type Feld = { name: string; xml: string; bits: number; raw: number[] }

function packeBits(werte: number[], bits: number): Buffer {
  const out = Buffer.alloc(Math.ceil((werte.length * bits) / 8))
  werte.forEach((v, i) => {
    for (let b = 0; b < bits; b++) {
      if (Math.floor(v / 2 ** b) % 2) { const pos = i * bits + b; out[pos >> 3] |= 1 << (pos & 7) }
    }
  })
  return out
}

function baueE57(felder: Feld[], anzahl: number, posenXml = ''): Buffer {
  const strome = felder.map((f) => packeBits(f.raw, f.bits))
  const stromGepolstert = strome.map((s) => Buffer.concat([s, Buffer.alloc((4 - (s.length % 4)) % 4)]))
  const kopfLaenge = 6 + 2 * felder.length
  const paketLaenge = kopfLaenge + stromGepolstert.reduce((s, b) => s + b.length, 0)
  const paket = Buffer.alloc(paketLaenge)
  paket.writeUInt8(1, 0); paket.writeUInt16LE(paketLaenge - 1, 2); paket.writeUInt16LE(felder.length, 4)
  let o = 6 + 2 * felder.length
  stromGepolstert.forEach((s, i) => { paket.writeUInt16LE(s.length, 6 + 2 * i); s.copy(paket, o); o += s.length })
  const abschnitt = Buffer.alloc(32)
  abschnitt.writeUInt8(1, 0); abschnitt.writeBigUInt64LE(BigInt(32 + paketLaenge), 8)
  abschnitt.writeBigUInt64LE(BigInt(80), 16); abschnitt.writeBigUInt64LE(BigInt(0), 24)
  const proto = felder.map((f) => f.xml).join('\n')
  const xml = Buffer.from(`<?xml version="1.0"?><e57Root type="Structure"><data3D type="Vector" allowHeterogeneousChildren="1"><vectorChild type="Structure">${posenXml}<points type="CompressedVector" fileOffset="48" recordCount="${anzahl}"><prototype type="Structure">${proto}</prototype><codecs type="Vector" allowHeterogeneousChildren="1"></codecs></points></vectorChild></data3D></e57Root>`, 'utf8')
  const kopf = Buffer.alloc(48)
  kopf.write('ASTM-E57', 0, 'ascii'); kopf.writeUInt32LE(1, 8)
  const logisch = Buffer.concat([kopf, abschnitt, paket])
  const xmlLogischAb = logisch.length
  const phys = (l: number) => l + 4 * Math.floor(l / 1020)
  const alles = Buffer.concat([logisch, xml])
  const seiten = Math.ceil(alles.length / 1020)
  const datei = Buffer.alloc(seiten * 1024)
  for (let p = 0; p < seiten; p++) alles.copy(datei, p * 1024, p * 1020, Math.min((p + 1) * 1020, alles.length))
  datei.writeBigUInt64LE(BigInt(datei.length), 16)
  datei.writeBigUInt64LE(BigInt(phys(xmlLogischAb)), 24)
  datei.writeBigUInt64LE(BigInt(xml.length), 32)
  datei.writeBigUInt64LE(BigInt(1024), 40)
  return datei
}

describe('E57 lesen', () => {
  it('echte Datei aus libE57 (pye57): Punktzahl, Koordinaten, Wertebereich', () => {
    const p: Float64Array = parseE57(lies('klein-haus.e57'))
    expect(p.length / 3).toBe(9100)
    // Die Datei speichert Einzelgenauigkeit (Float32): Referenzwerte stammen aus pye57.read_scan_raw
    expect(p[0]).toBeCloseTo(350006.125, 5)
    expect(p[1]).toBe(5700000)
    expect(p[2]).toBeCloseTo(45.70344924926758, 5)
    // letzter Punkt (Index 9099), ebenfalls aus pye57
    expect(p[9099 * 3]).toBeCloseTo(350017.25, 5)
    expect(p[9099 * 3 + 1]).toBe(5699997)
    expect(p[9099 * 3 + 2]).toBeCloseTo(39.90115737915039, 5)
    let zMin = Infinity, zMax = -Infinity
    for (let i = 2; i < p.length; i += 3) { zMin = Math.min(zMin, p[i]); zMax = Math.max(zMax, p[i]) }
    expect(zMin).toBeGreaterThan(39.8); expect(zMax).toBeLessThan(48.6)
  })

  it('Ende-zu-Ende: E57-Haus ergibt vertikale Achse z, Höhe ≈ 8,5 m und ein Satteldach-Teil 12 × 9 m', () => {
    const m = analysiere(lies('klein-haus.e57'), 'e57')
    expect(m.verticalAxis).toBe('z')
    expect(m.heightM).toBeGreaterThan(8.0); expect(m.heightM).toBeLessThan(9.0)
    expect(m.teile?.[0].dachForm).toBe('satteldach')
    expect(m.teile?.[0].laengeM).toBeGreaterThan(11); expect(m.teile?.[0].laengeM).toBeLessThan(13)
    expect(m.teile?.[0].tiefeM).toBeGreaterThan(8); expect(m.teile?.[0].tiefeM).toBeLessThan(10)
  })

  it('ScaledInteger + Integer-Ungültig-Status + Pose (Drehung 90° um z, Verschiebung 100 m in x)', () => {
    // fünf Punkte in Metern, Maßstab 1 mm; Punkt 3 ist als ungültig markiert
    const P = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15]]
    const roh = (a: number) => P.map((p) => Math.round(p[a] * 1000))
    const feld = (name: string, a: number): Feld => {
      const r = roh(a), min = Math.min(...r), max = Math.max(...r)
      return { name, bits: Math.ceil(Math.log2(max - min + 1)), raw: r.map((v) => v - min), xml: `<${name} type="ScaledInteger" minimum="${min}" maximum="${max}" scale="0.001" offset="0"/>` }
    }
    const ungueltig: Feld = { name: 'cartesianInvalidState', bits: 2, raw: [0, 0, 1, 0, 0], xml: '<cartesianInvalidState type="Integer" minimum="0" maximum="2"/>' }
    const c = Math.SQRT1_2
    const pose = `<pose type="Structure"><rotation type="Structure"><w type="Float">${c}</w><x type="Float"/><y type="Float"/><z type="Float">${c}</z></rotation><translation type="Structure"><x type="Float">100</x><y type="Float"/><z type="Float"/></translation></pose>`
    const datei = baueE57([feld('cartesianX', 0), feld('cartesianY', 1), feld('cartesianZ', 2), ungueltig], 5, pose)
    const p: Float64Array = parseE57(datei)
    expect(p.length / 3).toBe(4)
    // (x, y, z) → (−y, x, z) + (100, 0, 0)
    const erwartet = [[98, 1, 3], [95, 4, 6], [89, 10, 12], [86, 13, 15]]
    erwartet.forEach((e, i) => { expect(p[i * 3]).toBeCloseTo(e[0], 6); expect(p[i * 3 + 1]).toBeCloseTo(e[1], 6); expect(p[i * 3 + 2]).toBeCloseTo(e[2], 6) })
  })

  it('Fehlermeldungen sind verständlich: keine E57, abgeschnitten, nur Kugelkoordinaten', () => {
    expect(() => parseE57(Buffer.alloc(200))).toThrow(/Keine gültige E57/)
    const echt = lies('klein-haus.e57')
    expect(() => parseE57(echt.subarray(0, 20000))).toThrow(/abgeschnitten/)
    const kugel: Feld[] = ['sphericalRange', 'sphericalAzimuth', 'sphericalElevation'].map((n) => ({ name: n, bits: 4, raw: [1, 2, 3], xml: `<${n} type="ScaledInteger" minimum="0" maximum="15" scale="1" offset="0"/>` }))
    expect(() => parseE57(baueE57(kugel, 3))).toThrow(/Kugelkoordinaten/)
  })
})

describe('Textlisten (XYZ, PTS, TXT, CSV) lesen', () => {
  const zeilen = (...z: string[]) => Buffer.from(z.join('\n'), 'latin1')

  it('XYZ mit Leerzeichen und Zusatzspalten (Intensität, Farbe)', () => {
    const p: Float64Array = parseXyz(zeilen('1 2 3 200 10 20 30', '4.5 5.5 6.5 180 11 21 31', '7 8 9 90 12 22 32'))
    expect(Array.from(p)).toEqual([1, 2, 3, 4.5, 5.5, 6.5, 7, 8, 9])
  })
  it('PTS: Zeile mit der Punktzahl wird übersprungen', () => {
    const p: Float64Array = parseXyz(zeilen('3', '1 2 3 100', '4 5 6 100', '7 8 9 100'))
    expect(p.length / 3).toBe(3)
  })
  it('CSV mit Kopfzeile, Semikolon und deutschem Dezimalkomma', () => {
    const p: Float64Array = parseXyz(zeilen('X;Y;Z;Intensität', '1,5;2,5;3,5;10', '4,5;5,5;6,5;10', '7,5;8,5;9,5;10'))
    expect(Array.from(p)).toEqual([1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5])
  })
  it('Kommentare, Leerzeilen, Windows-Zeilenenden, Exponentschreibweise', () => {
    const p: Float64Array = parseXyz(zeilen('# Scan 1', '', '1e2\t2e0\t3\r', '4,5,6', '7 8 9'))
    expect(Array.from(p)).toEqual([100, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('keine Zahlen → verständliche Meldung', () => {
    expect(() => parseXyz(zeilen('Hallo', 'Welt'))).toThrow(/keine Punkte/)
  })
  it('Ende-zu-Ende: XYZ-Haus wird wie die E57-Datei ausgewertet', () => {
    const e = parseE57(lies('klein-haus.e57')) as Float64Array
    const text = Array.from({ length: e.length / 3 }, (_, i) => `${e[i * 3].toFixed(3)} ${e[i * 3 + 1].toFixed(3)} ${e[i * 3 + 2].toFixed(3)} 100`).join('\n')
    const m = analysiere(Buffer.from(text), 'xyz')
    expect(m.verticalAxis).toBe('z')
    expect(m.heightM).toBeGreaterThan(8.0); expect(m.heightM).toBeLessThan(9.0)
  })
})
