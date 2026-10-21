import { describe, it, expect } from 'vitest'
import { verdichteObjStrom } from '../obj-verdichten'
import { dreieckeAusObj } from '@/lib/cad/modell-import'
import { spannweiten } from '@/lib/cad/modell-analyse'

function strom(text: string, stueck = 1000): ReadableStream<Uint8Array> {
  const b = new TextEncoder().encode(text)
  let p = 0
  return new ReadableStream({ pull(c) { if (p >= b.length) { c.close(); return } c.enqueue(b.slice(p, p + stueck)); p += stueck } })
}

/** Quader-Oberfläche (b×h×t, Y oben), jede Fläche in n×n Quadrate zerlegt → viele kleine Dreiecke */
function feinerQuader(b: number, h: number, t: number, n: number): string {
  const v: string[] = [], f: string[] = []
  const flaeche = (o: number[], u: number[], w: number[]) => {
    const base = v.length
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) v.push(`v ${o[0] + u[0] * i / n + w[0] * j / n} ${o[1] + u[1] * i / n + w[1] * j / n} ${o[2] + u[2] * i / n + w[2] * j / n}`)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = base + i * (n + 1) + j + 1, c = a + n + 1; f.push(`f ${a} ${c} ${c + 1}`, `f ${a} ${c + 1} ${a + 1}`) }
  }
  flaeche([0, 0, 0], [b, 0, 0], [0, 0, t]); flaeche([0, h, 0], [b, 0, 0], [0, 0, t])
  flaeche([0, 0, 0], [b, 0, 0], [0, h, 0]); flaeche([0, 0, t], [b, 0, 0], [0, h, 0])
  flaeche([0, 0, 0], [0, 0, t], [0, h, 0]); flaeche([b, 0, 0], [0, 0, t], [0, h, 0])
  return v.join('\n') + '\n' + f.join('\n') + '\n'
}

describe('verdichteObjStrom', () => {
  it('kleine Dateien bleiben vollständig (nur neu geschrieben)', async () => {
    const r = await verdichteObjStrom(strom('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'), { maxDreiecke: 100 })
    expect(r.dreieckeVorher).toBe(1); expect(r.dreieckeNachher).toBe(1)
    expect(dreieckeAusObj(r.obj).length).toBe(9)
  })

  it('Vierecke werden zerlegt, v/vt/vn-Schreibweise und negative Indizes funktionieren, Zeilen über Stückgrenzen', async () => {
    const text = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1/1 2/2/2 3/3/3 4/4/4\nf -4 -3 -2\n'
    const r = await verdichteObjStrom(strom(text, 7), { maxDreiecke: 100 })
    expect(r.dreieckeVorher).toBe(3)
    expect(dreieckeAusObj(r.obj).length).toBe(27)
  })

  it('kaputte Flächen (Index außerhalb) werden übersprungen statt den Import zu kippen', async () => {
    const r = await verdichteObjStrom(strom('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nf 1 2 99\nf 0 1 2\n'), { maxDreiecke: 100 })
    expect(r.dreieckeVorher).toBe(1)
  })

  it('Datei ohne Flächen → leeres Ergebnis', async () => {
    expect((await verdichteObjStrom(strom('# nichts\n'))).dreieckeNachher).toBe(0)
  })

  it('feines Modell wird auf die Grenze verdichtet, Außenmaße bleiben erhalten', async () => {
    const text = feinerQuader(12, 31, 8, 60) // 6 × 60 × 60 × 2 = 43 200 Dreiecke
    const r = await verdichteObjStrom(strom(text, 65536), { maxDreiecke: 2000, zellen: 60 })
    expect(r.dreieckeVorher).toBe(43200)
    expect(r.dreieckeNachher).toBeLessThanOrEqual(2000)
    expect(r.dreieckeNachher).toBeGreaterThan(200)
    const s = spannweiten(dreieckeAusObj(r.obj))
    expect(s[0]).toBeGreaterThan(11); expect(s[0]).toBeLessThanOrEqual(12.0001)
    expect(s[1]).toBeGreaterThan(30); expect(s[1]).toBeLessThanOrEqual(31.0001)
    expect(s[2]).toBeGreaterThan(7); expect(s[2]).toBeLessThanOrEqual(8.0001)
  })

  it('Größenbegrenzung des Datenstroms bricht ab', async () => {
    await expect(verdichteObjStrom(strom('v 0 0 0\n'.repeat(500), 100), { maxBytes: 1000 })).rejects.toThrow(/zu groß/)
  })
})
