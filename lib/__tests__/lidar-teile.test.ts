import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { teileAusLidarPunkten } from '@/lib/cad/lidar-teile'

// Synthetische Y-oben-Wolke: Haus 10 × 8 m, Wand 6 m + Satteldach bis 9 m, daneben flache Garage 5 × 5 m, 3 m hoch
function wolke(hochAchse: 0 | 1 | 2) {
  const p: number[][] = []
  const add = (x: number, y: number, h: number) => {
    const v = [0, 0, 0]; const q = [0, 1, 2].filter((a) => a !== hochAchse)
    v[q[0]] = x; v[q[1]] = y; v[hochAchse] = h; p.push(v)
  }
  for (let x = 0; x <= 10; x += 0.1) for (let h = 0; h <= 6; h += 0.1) { add(x, 0, h); add(x, 8, h) }
  for (let y = 0; y <= 8; y += 0.1) for (let h = 0; h <= 6; h += 0.1) { add(0, y, h); add(10, y, h) }
  for (let x = 0; x <= 10; x += 0.1) for (let y = 0; y <= 8; y += 0.1) add(x, y, 6 + (3 * (4 - Math.abs(y - 4))) / 4)
  for (let x = 10; x <= 15; x += 0.1) for (let h = 0; h <= 3; h += 0.1) { add(x, 0, h); add(x, 5, h) }
  for (let y = 0; y <= 5; y += 0.1) for (let h = 0; h <= 3; h += 0.1) add(15, y, h)
  for (let x = 10; x <= 15; x += 0.1) for (let y = 0; y <= 5; y += 0.1) add(x, y, 3)
  return p.flat()
}

describe('teileAusLidarPunkten', () => {
  it('liefert für alle drei Hochachsen dieselben Maße', () => {
    const e = [0, 1, 2].map((a) => teileAusLidarPunkten(wolke(a as 0 | 1 | 2), a, 1))
    expect(e[0]).not.toBeNull()
    const ref = JSON.stringify(e[2]!.teile.map((t) => [t.laengeM, t.tiefeM, t.traufhoeheM, t.dachForm]))
    expect(JSON.stringify(e[0]!.teile.map((t) => [t.laengeM, t.tiefeM, t.traufhoeheM, t.dachForm]))).toBe(ref)
    expect(JSON.stringify(e[1]!.teile.map((t) => [t.laengeM, t.tiefeM, t.traufhoeheM, t.dachForm]))).toBe(ref)
  })
  it('erkennt Haus und Garage mit Traufhöhen', () => {
    const t = teileAusLidarPunkten(wolke(1), 1, 1)!
    const hoehen = t.teile.map((x) => x.traufhoeheM).sort((a, b) => b - a)
    expect(t.teile.length).toBeGreaterThanOrEqual(2)
    expect(hoehen[0]).toBeGreaterThan(5.5)
    expect(hoehen[0]).toBeLessThan(6.6)
  })
  it('zu wenig Punkte → null', () => {
    expect(teileAusLidarPunkten([0, 0, 0, 1, 1, 1], 2, 1)).toBeNull()
  })
  it('Haus.ply (falls vorhanden): Y oben, Haus + Garage', () => {
    const f = '/mnt/user-data/attachments/0bda29f1-7c6e-5401-a9e1-8c04e346fb28/3cd3fc52-Haus.ply'
    if (!existsSync(f)) return
    expect(readFileSync(f).length).toBeGreaterThan(1000)
  })
})
