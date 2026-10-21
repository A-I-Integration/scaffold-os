import { describe, it, expect } from 'vitest'
import { dreieckeAusGltf } from '../gltf-dreiecke'
import { analysiereDreiecke } from '../modell-analyse'
import { dreieckeMitHoehe } from '../modell-import'

// Node kennt kein ProgressEvent (der three.js-Lader meldet damit im Browser den Ladefortschritt) – nur für den Test nachgerüstet
if (typeof (globalThis as { ProgressEvent?: unknown }).ProgressEvent === 'undefined') {
  ;(globalThis as unknown as { ProgressEvent: unknown }).ProgressEvent = class extends Event { constructor(t: string) { super(t) } }
}

/** Mini-glTF: ein Quader (12 Dreiecke), Buffer eingebettet (base64). Maße in Metern: 10 × 6 × 4 (Y oben). */
function quaderGltf(b = 10, h = 6, t = 4, knotenVersatz: [number, number, number] = [0, 0, 0]) {
  const x = b / 2, y = h, z = t / 2
  const pos = [[-x, 0, -z], [x, 0, -z], [x, y, -z], [-x, y, -z], [-x, 0, z], [x, 0, z], [x, y, z], [-x, y, z]]
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 3, 7, 6, 3, 6, 2, 0, 1, 5, 0, 5, 4]
  const pb = Buffer.from(new Float32Array(pos.flat()).buffer)
  const ib = Buffer.from(new Uint16Array(idx).buffer)
  const alle = Buffer.concat([pb, ib])
  return {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: knotenVersatz }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    buffers: [{ byteLength: alle.length, uri: 'data:application/octet-stream;base64,' + alle.toString('base64') }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pb.length, target: 34962 }, { buffer: 0, byteOffset: pb.length, byteLength: ib.length, target: 34963 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-x, 0, -z], max: [x, y, z] },
      { bufferView: 1, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
  }
}

describe('glTF → Dreiecke (Brücke zum OBJ-Weg)', () => {
  it('liest den Mini-Quader: 12 Dreiecke, 9 Werte je Dreieck', async () => {
    const r = await dreieckeAusGltf(JSON.stringify(quaderGltf()))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.anzahl).toBe(12)
    expect(r.dreiecke.length).toBe(12 * 9)
  })

  it('rechnet Knoten-Verschiebungen in Weltkoordinaten ein', async () => {
    const r = await dreieckeAusGltf(JSON.stringify(quaderGltf(10, 6, 4, [100, 0, 0])))
    if (!r.ok) throw new Error(r.meldung)
    const xs = Array.from({ length: r.dreiecke.length / 3 }, (_, i) => r.dreiecke[i * 3])
    expect(Math.min(...xs)).toBeCloseTo(95)
    expect(Math.max(...xs)).toBeCloseTo(105)
  })

  it('gleicher Pfad wie OBJ: die Dreiecke gehen unverändert in analysiereDreiecke (Y oben, Meter)', async () => {
    const r = await dreieckeAusGltf(JSON.stringify(quaderGltf(12, 7, 8)))
    if (!r.ok) throw new Error(r.meldung)
    const a = analysiereDreiecke(r.dreiecke, { format: 'obj', einheit: 'm', oben: 'y', quelle: 'nwd' })
    expect(a).not.toBeNull()
    expect(a!.teile.length).toBeGreaterThan(0)
    expect(a!.teile.every((t) => t.quelle === 'nwd')).toBe(true)
    expect(a!.teile[0].hoeheM).toBeCloseTo(7, 0)
    // zur Kontrolle: dieselben Dreiecke über den Höhen-Helfer ergeben dieselbe Dreieckszahl
    expect(dreieckeMitHoehe(r.dreiecke, 'm', 'y').length).toBe(12)
  })

  it('defektes glTF (kein JSON) → Hinweis statt Import', async () => {
    const r = await dreieckeAusGltf('das ist kein glTF')
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.grund).toBe('defekt'); expect(r.meldung).toMatch(/IFC oder OBJ/) }
  })

  it('abgeschnittene Binärdaten → Hinweis statt halbem Import', async () => {
    const g = quaderGltf()
    g.buffers[0].uri = g.buffers[0].uri.slice(0, 80) // Daten abgeschnitten
    const r = await dreieckeAusGltf(JSON.stringify(g))
    expect(r.ok).toBe(false)
  })

  it('gültiges glTF ohne Flächen → „leer“', async () => {
    const r = await dreieckeAusGltf(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toBe('leer')
  })
})
