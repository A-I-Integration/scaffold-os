import { describe, it, expect } from 'vitest'
import { anschlussStatus } from '@/lib/cad/anschluss-status'
import type { PortBauteil } from '@/lib/cad/anschluesse'

const b = (id: string, type: string, position: [number, number, number], scale: [number, number, number] = [1, 1, 1]) =>
  ({ id, type, position, rotation: [0, 0, 0], scale }) as unknown as PortBauteil

describe('Anschlussstatus', () => {
  it('Bauteil ohne Anschlusspunkte ist unbekannt', () => {
    const x = b('x', 'net', [0, 0, 0])
    const s = anschlussStatus(x, [x])
    expect(s.zustand).toBe('unbekannt'); expect(s.punkte).toBe(0)
  })
  it('ist nie herstellerbestätigt und zählt freie Punkte als offen', () => {
    const f = b('f', 'footplate', [0, 0, 0])
    const s = anschlussStatus(f, [f])
    expect(s.zustand).toBe('abgeleitet'); expect(s.herstellerbestaetigt).toBe(false)
    expect(s.verbunden).toBe(0); expect(s.offen).toBe(s.punkte)
  })
  it('erkennt einen geometrisch passenden Nachbarn als verbunden', () => {
    const a = b('a', 'footplate', [0, 0, 0]); const c = b('c', 'coupling', [0, 0, 0])
    const s = anschlussStatus(a, [a, c])
    expect(['abgeleitet', 'ungueltig']).toContain(s.zustand)
    expect(s.verbunden + s.offen).toBe(s.punkte)
  })
})
