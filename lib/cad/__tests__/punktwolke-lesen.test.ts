import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { aussehenAusScanDatei, fuerAnzeige, parseLasEinfach, punkteAusScanDaten, istScanEndung } from '@/lib/cad/punktwolke-lesen'

const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

function lasDatei(punkte: number[][], versatz = [350000, 5700000, 100]): ArrayBuffer {
  const kopf = 227, rec = 20, n = punkte.length
  const b = Buffer.alloc(kopf + n * rec)
  b.write('LASF', 0, 'latin1'); b.writeUInt8(1, 24); b.writeUInt8(2, 25)
  b.writeUInt16LE(kopf, 94); b.writeUInt32LE(kopf, 96); b.writeUInt8(0, 104); b.writeUInt16LE(rec, 105); b.writeUInt32LE(n, 107)
  ;[0.001, 0.001, 0.001, ...versatz].forEach((v, i) => b.writeDoubleLE(v, 131 + i * 8))
  punkte.forEach((p, i) => { for (let k = 0; k < 3; k++) b.writeInt32LE(Math.round((p[k]) / 0.001), kopf + i * rec + k * 4) })
  return ab(b)
}
const wuerfel = (): number[][] => { const l: number[][] = []; for (let x = 0; x < 6; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 4; z++) l.push([x * 0.1 + 0.5, y * 0.1 + 0.5, z * 0.1 + 0.5]); return l }

describe('Scan-Dateien im Browser lesen', () => {
  it('erkennt die Endungen', () => {
    expect(istScanEndung('A.E57')).toBe(true); expect(istScanEndung('a.ptx')).toBe(true); expect(istScanEndung('a.ply')).toBe(false)
  })
  it('LAS: Maßstab und Versatz werden angewendet', () => {
    const p = parseLasEinfach(lasDatei(wuerfel()))
    expect(p.length).toBe(120 * 3)
    expect(p[0]).toBeCloseTo(350000.5, 3); expect(p[1]).toBeCloseTo(5700000.5, 3); expect(p[2]).toBeCloseTo(100.5, 3)
  })
  it('LAZ-Dateien: verständliche Meldung statt Absturz', () => {
    const r = aussehenAusScanDatei(new ArrayBuffer(300), 'x.laz')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toMatch(/LAZ/)
  })
  it('PTX: Punkte, 0 0 0 wird übersprungen', () => {
    const zeilen = ['2', '2', '0 0 0', '1 0 0', '0 1 0', '0 0 1', '1 0 0 0', '0 1 0 0', '0 0 1 0', '0 0 0 1', '0 0 0 0.5', '1 2 3 0.5', '4 5 6 0.5', '7 8 9 0.5']
    const p = punkteAusScanDaten(ab(Buffer.from(zeilen.join('\n'))), 'a.ptx')
    expect(Array.from(p)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('XYZ/PTS: Textpunkte', () => {
    const t = Array.from({ length: 30 }, (_, i) => `${i} ${i * 2} ${i * 3}`).join('\n')
    const p = punkteAusScanDaten(ab(Buffer.from(t)), 'a.xyz')
    expect(p.length).toBe(90)
  })
  it('E57 aus den Testdaten des Workers', () => {
    const d = readFileSync('workers/punktwolke/testdaten/klein-haus.e57')
    const r = aussehenAusScanDatei(ab(d), 'klein-haus.e57')
    expect(r.ok).toBe(true)
    if (r.ok && r.aussehen.art === 'punkte') { expect(r.aussehen.positionen.length).toBeGreaterThan(60); expect(r.oben).toBe('z') }
  })
  it('Anzeige: ausdünnen und zum Schwerpunkt verschieben (große Koordinaten bleiben genau)', () => {
    const p = parseLasEinfach(lasDatei(wuerfel()))
    const a = fuerAnzeige(p, 50)
    expect(a.anzahl).toBeLessThanOrEqual(60)
    expect(Math.abs(a.mitte[0] - 350000.75)).toBeLessThan(0.3)
    let mx = 0; for (const v of a.positionen) mx = Math.max(mx, Math.abs(v))
    expect(mx).toBeLessThan(1)
  })

  it('Farbe: LAS-Format 2 mit RGB (16 Bit) wird übernommen; 8 Bit in 16-Bit-Feldern ebenso; Format 0 bleibt grau', () => {
    const bau = (farben: number[][]): ArrayBuffer => {
      const kopf = 227, rec = 26, n = farben.length
      const b = Buffer.alloc(kopf + n * rec)
      b.write('LASF', 0, 'latin1'); b.writeUInt8(1, 24); b.writeUInt8(2, 25)
      b.writeUInt16LE(kopf, 94); b.writeUInt32LE(kopf, 96); b.writeUInt8(2, 104); b.writeUInt16LE(rec, 105); b.writeUInt32LE(n, 107)
      ;[0.001, 0.001, 0.001, 0, 0, 0].forEach((v, i) => b.writeDoubleLE(v, 131 + i * 8))
      farben.forEach((c, i) => { for (let k = 0; k < 3; k++) { b.writeInt32LE(1000 * (i + 1), kopf + i * rec + k * 4); b.writeUInt16LE(c[k], kopf + i * rec + 20 + k * 2) } })
      return ab(b)
    }
    const p16 = parseLasEinfach(bau([[65535, 0, 0], [0, 65535, 0], [0, 0, 65535]]))
    expect(Array.from(p16.farben!)).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255])
    const p8 = parseLasEinfach(bau([[200, 100, 0], [10, 20, 30], [0, 0, 255]]))
    expect(Array.from(p8.farben!.slice(0, 3))).toEqual([200, 100, 0])
    expect(parseLasEinfach(lasDatei(wuerfel())).farben).toBeUndefined()
  })
  it('Farbe: kommt bis in die Anzeige (Aussehen) und bleibt beim Ausdünnen beim richtigen Punkt', () => {
    const t = Array.from({ length: 40 }, (_, i) => `${i} 0 0 ${i * 6} 0 0`).join('\n')
    const r = aussehenAusScanDatei(ab(Buffer.from(t)), 'a.xyz')
    expect(r.ok).toBe(true)
    if (r.ok && r.aussehen.art === 'punkte') {
      expect(r.hinweis).toMatch(/mit Farbe/)
      // x-Koordinate relativ zum Schwerpunkt; Rot = i*6 → rot wächst mit x
      const x = r.aussehen.positionen, f = r.aussehen.farben
      expect(f[1]).toBe(0)
      expect(f[(39) * 3]).toBeGreaterThan(f[0])
      expect(x[39 * 3]).toBeGreaterThan(x[0])
    }
    const grau = aussehenAusScanDatei(ab(Buffer.from(Array.from({ length: 40 }, (_, i) => `${i} 0 0`).join('\n'))), 'a.xyz')
    if (grau.ok && grau.aussehen.art === 'punkte') { expect(grau.hinweis).toMatch(/grau/); expect(grau.aussehen.farben[0]).toBe(190) }
  })
})
