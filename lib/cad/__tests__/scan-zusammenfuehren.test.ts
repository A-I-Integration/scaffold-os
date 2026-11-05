import { describe, it, expect } from 'vitest'
import { erzeugeDraufsicht, hoeheAn, fuehreScansZusammen } from '@/lib/cad/scan-zusammenfuehren'
import { starrUmZ, wendeStarrAn, invertiere, type V3 } from '@/lib/cad/registrierung'

const flaeche = (x0: number, y0: number, z: number, lx: number, ly: number): number[] => { const p: number[] = []; for (let x = 0; x <= lx; x += 0.1) for (let y = 0; y <= ly; y += 0.1) p.push(x0 + x, y0 + y, z); return p }

describe('Draufsicht', () => {
  it('höchster Punkt je Zelle, Höhe an einer Stelle', () => {
    const p = [...flaeche(0, 0, 3, 4, 4), 2, 2, 7]
    const d = erzeugeDraufsicht(p, 0.1)!
    expect(hoeheAn(d, 2, 2)).toBeCloseTo(7, 5)
    expect(hoeheAn(d, 0.5, 0.5)).toBeCloseTo(3, 5)
    expect(hoeheAn(d, 50, 50)).toBeNull()
    expect(d.zHoch).toBe(7)
  })
  it('wenige Punkte: null', () => { expect(erzeugeDraufsicht([0, 0, 0], 0.1)).toBeNull() })
})

describe('fuehreScansZusammen', () => {
  const ecken: V3[] = [[0, 0, 1], [6, 0, 2], [0, 5, 3], [6, 5, 1.5]]
  const A = Float64Array.from([...flaeche(0, 0, 0, 6, 5), ...flaeche(0, 0, 3, 6, 5)])
  const soll = starrUmZ(25, [10, -4, 0.5])
  const B = wendeStarrAn(A, invertiere(soll))                 // gleicher Gegenstand in anderer Lage

  it('Handpunkte: Lage wird gefunden, beide Scans landen deckungsgleich', () => {
    const paare = ecken.map((e) => ({ von: Array.from(wendeStarrAn(e, invertiere(soll))) as V3, nach: e }))
    const r = fuehreScansZusammen([{ name: 'A', punkte: A, weg: 'bekannt' }, { name: 'B', punkte: B, weg: 'handpunkte', paare }])
    expect(r.ergebnisse[1].ok).toBe(true)
    expect(r.ergebnisse[1].qualitaet).toBe('gut')
    expect(r.uebernommen).toBe(2)
    expect(r.punkte.length).toBe(A.length + B.length)
    const nachB = r.punkte.slice(A.length, A.length + 3)
    expect(Math.abs(nachB[0] - A[0])).toBeLessThan(1e-6); expect(Math.abs(nachB[2] - A[2])).toBeLessThan(1e-6)
  })
  it('Handpunkte: zu wenige Paare → nicht übernommen, Meldung', () => {
    const r = fuehreScansZusammen([{ name: 'A', punkte: A, weg: 'bekannt' }, { name: 'B', punkte: B, weg: 'handpunkte', paare: [{ von: [0, 0, 0], nach: [0, 0, 0] }] }])
    expect(r.ergebnisse[1].ok).toBe(false)
    expect(r.uebernommen).toBe(1)
    expect(r.punkte.length).toBe(A.length)
    expect(r.ergebnisse[1].hinweise[0]).toMatch(/drei/)
  })
  it('bekannt: unverändert übernommen', () => {
    const r = fuehreScansZusammen([{ name: 'A', punkte: A, weg: 'bekannt' }, { name: 'B', punkte: A, weg: 'bekannt' }])
    expect(r.punkte.length).toBe(A.length * 2)
    expect(r.ergebnisse[1].qualitaet).toBe('bekannt')
  })
  it('automatisch: zu kleiner Scan → nicht übernommen', () => {
    const r = fuehreScansZusammen([{ name: 'A', punkte: A, weg: 'bekannt' }, { name: 'B', punkte: Float64Array.from([0, 0, 0, 1, 1, 1]), weg: 'automatisch' }])
    expect(r.ergebnisse[1].ok).toBe(false)
    expect(r.uebernommen).toBe(1)
  })
})
