import { describe, it, expect } from 'vitest'
import { ports, kompatibel, findeVerbindungen, type PortBauteil } from '@/lib/cad/anschluesse'

const rahmen = (id: string, y: number): PortBauteil => ({ id, type: 'frame', position: [0, y, 0], rotation: [0, 0, 0], scale: [0.05, 2, 0.05], rahmenBreiteM: 0.73 })

describe('Anschlusspunkte', () => {
  it('Rahmen mit Breite hat 2 Köpfe und 2 Füße', () => {
    const p = ports(rahmen('a', 1))
    expect(p.filter((x) => x.typ === 'stiel-kopf')).toHaveLength(2)
    expect(p.filter((x) => x.typ === 'stiel-fuss')).toHaveLength(2)
    expect(p.every((x) => x.quelle === 'abgeleitet')).toBe(true)
  })
  it('Drehung um Y dreht die Punkte mit', () => {
    const c = { ...rahmen('a', 1), rotation: [0, Math.PI / 2, 0] as [number, number, number] }
    const kopf = ports(c).filter((x) => x.typ === 'stiel-kopf').map((x) => x.pos)
    expect(kopf.some((p) => Math.abs(p[0] - 0.655) < 1e-6)).toBe(true) // lokal z=0.655 → Welt x
  })
  it('Bauteile ohne Definition haben keine Punkte', () => {
    expect(ports({ id: 'n', type: 'net', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })).toEqual([])
  })
})

describe('Verbindungen', () => {
  it('gestapelte Rahmen werden an beiden Stielen verbunden', () => {
    const v = findeVerbindungen([rahmen('a', 1), rahmen('b', 3)])
    expect(v).toHaveLength(2)
    expect(v.every((x) => x.abstandM < 1e-6)).toBe(true)
  })
  it('Lücke über der Toleranz verbindet nicht', () => {
    expect(findeVerbindungen([rahmen('a', 1), rahmen('b', 3.1)])).toHaveLength(0)
  })
  it('Kopf auf Kopf (ein Rahmen auf den Kopf gedreht) ist nicht kompatibel', () => {
    const b = { ...rahmen('b', 3), rotation: [Math.PI, 0, 0] as [number, number, number] }
    const a = ports(rahmen('a', 1)).find((x) => x.typ === 'stiel-kopf')!
    const bk = ports(b).find((x) => x.typ === 'stiel-fuss')!
    expect(kompatibel(a, bk).ok).toBe(false)
  })
  it('gleiches Bauteil verbindet sich nicht mit sich selbst', () => {
    const p = ports(rahmen('a', 1))
    expect(kompatibel(p[0], p[1]).ok).toBe(false)
  })
  it('Belag hat vier Auflagerpunkte', () => {
    const deck: PortBauteil = { id: 'd', type: 'deck', position: [0, 2.02, 0], rotation: [0, 0, 0], scale: [0.05, 0.05, 0.04] }
    expect(ports(deck)).toHaveLength(4)
  })
  it('skaliert: 6.000 Rahmen (60 Felder × 10 Lagen, 100 Felder Länge) in unter 2 s', () => {
    const l: PortBauteil[] = Array.from({ length: 6000 }, (_, i) => ({ ...rahmen(`r${i}`, 1 + (i % 10) * 2), position: [Math.floor(i / 10) * 2.5, 1 + (i % 10) * 2, 0] as [number, number, number] }))
    const t = Date.now()
    findeVerbindungen(l)
    expect(Date.now() - t).toBeLessThan(2000)
  })
})
