import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

// Die Erkennung liegt im KI-Worker (CommonJS-Skript mit Seiteneffekten). Hier wird nur
// die Funktion herausgeschnitten und geprüft.
const quelle = readFileSync('workers/ki/index.js', 'utf8')
const start = quelle.indexOf('function erkenneStufen')
const ende = quelle.indexOf('// Phase 90')
const erkenneStufen = new Function(`${quelle.slice(start, ende)}; return erkenneStufen;`)() as (px: number[], py: number[], pz: number[], d: Record<string, number>) => null | { achse: string; abschnitte: { laengeM: number; hoeheM: number; schaftM?: number; spitzeM?: number }[]; laenge: number; tiefe: number }

function wolke(punkte: [number, number, number][]) {
  const px = punkte.map((p) => p[0]), py = punkte.map((p) => p[1]), pz = punkte.map((p) => p[2])
  const mn = (a: number[]) => a.reduce((m, v) => (v < m ? v : m), Infinity), mx = (a: number[]) => a.reduce((m, v) => (v > m ? v : m), -Infinity)
  const d = { minX: mn(px), minY: mn(py), minZ: mn(pz), spanX: mx(px) - mn(px), spanY: mx(py) - mn(py) }
  return { px, py, pz, d }
}
const schritt = (a: number, b: number, s = 0.3) => { const n = Math.max(1, Math.round((b - a) / s)); return Array.from({ length: n + 1 }, (_, i) => a + (i * (b - a)) / n) }

describe('Punktwolke: Höhenabschnitte', () => {
  it('erkennt zwei Höhenstufen (Altverhalten)', () => {
    const p: [number, number, number][] = []
    for (const x of schritt(0, 10)) for (const y of schritt(0, 8)) for (const z of schritt(0, 12, 0.5)) p.push([x, y, z])
    for (const x of schritt(10, 25)) for (const y of schritt(0, 8)) for (const z of schritt(0, 6, 0.5)) p.push([x, y, z])
    const w = wolke(p)
    const r = erkenneStufen(w.px, w.py, w.pz, w.d)!
    expect(r.abschnitte.length).toBe(2)
    expect(r.abschnitte[0].hoeheM).toBeCloseTo(12, 0)
    expect(r.abschnitte[1].hoeheM).toBeCloseTo(6, 0)
    expect(r.abschnitte[0].spitzeM).toBeUndefined()
  })

  it('erkennt Turm mit spitzem Helm neben dem Schiff', () => {
    // Turm x -9..0, Schaft 45 m, Pyramide bis 58 m; Schiff x 0..30 mit First 20 m
    const p: [number, number, number][] = []
    for (const x of schritt(-9, 0)) for (const y of schritt(1.5, 10.5)) for (const z of schritt(0, 45, 0.5)) p.push([x, y, z])
    for (const z of schritt(45, 58, 0.5)) {
      const k = 1 - (z - 45) / 13, hw = 4.5 * k
      for (const t of schritt(-hw, hw)) for (const u of schritt(-hw, hw)) p.push([-4.5 + t, 6 + u, z])
    }
    for (const x of schritt(0, 30)) for (const y of schritt(0, 12)) for (const z of schritt(0, 12 + 8 * (1 - Math.abs(y - 6) / 6), 0.5)) p.push([x, y, z])
    const w = wolke(p)
    const r = erkenneStufen(w.px, w.py, w.pz, w.d)!
    expect(r).not.toBeNull()
    expect(r.abschnitte.length).toBe(2)
    const turm = r.abschnitte[0]
    // die Spitze wird robust (mehrere Punkte, 0,5-m-Streifen) geschätzt und kann bis ca. 1 m unter der echten Spitze liegen
    expect(turm.spitzeM!).toBeGreaterThan(56.5)
    expect(turm.spitzeM!).toBeLessThan(58.5)
    expect(turm.schaftM!).toBeGreaterThan(43)
    expect(turm.schaftM!).toBeLessThan(47)
    expect(Math.abs(turm.laengeM - 9)).toBeLessThanOrEqual(1) // Streifenraster 0,5 m
    expect(r.abschnitte[1].hoeheM).toBeCloseTo(20, 0)
    expect(r.abschnitte[1].spitzeM).toBeUndefined()
  })

  it('liefert null für einen einfachen Quader', () => {
    const p: [number, number, number][] = []
    for (const x of schritt(0, 20)) for (const y of schritt(0, 8)) for (const z of schritt(0, 10, 0.5)) p.push([x, y, z])
    const w = wolke(p)
    expect(erkenneStufen(w.px, w.py, w.pz, w.d)).toBeNull()
  })
})
