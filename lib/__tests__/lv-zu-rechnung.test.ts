import { describe, it, expect } from 'vitest'
import { artAusTitel, rechnungAusLv } from '@/lib/lv-zu-rechnung'
import type { Leistungsverzeichnis } from '@/lib/leistungsverzeichnis'

const pos = (nr: string, titel: string, menge: number, ep: number, extra: object = {}) =>
  ({ nr, titel, text: [], menge, einheit: 'm²', ep, gp: Math.round(menge * ep * (((extra as any).faktorProzent ?? 100) / 100) * 100) / 100, ...extra })
const lv = (positionen: any[]): Leistungsverzeichnis =>
  ({ titel: [{ nr: 1, nrText: '01', titel: 'T', positionen, summe: 0 }] } as unknown as Leistungsverzeichnis)

describe('artAusTitel', () => {
  it('erkennt Arten', () => {
    expect(artAusTitel('Konsolen')).toBe('konsolen')
    expect(artAusTitel('Vorhaltung je Woche')).toBe('miete')
    expect(artAusTitel('Aufbau Gerüst')).toBe('aufbau')
    expect(artAusTitel('Abbau')).toBe('abbau')
    expect(artAusTitel('Kederplane')).toBe('plane')
    expect(artAusTitel('Sonstiges Ding', 'Std.')).toBe('regie')
    expect(artAusTitel('Etwas')).toBe('sonstiges')
  })
})

describe('rechnungAusLv', () => {
  it('übernimmt Faktor als Listenpreis × Faktor', () => {
    const r = rechnungAusLv(lv([pos('01.01', 'Aufbau', 10, 20, { faktorProzent: 80 })]))
    expect(r.positions[0]).toMatchObject({ einzelpreis: 16, listenpreis: 20, faktorProzent: 80, art: 'aufbau', bezeichnung: '01.01 Aufbau' })
    expect(r.summeNetto).toBe(160)
    expect(r.rundungsDifferenz).toBe(0)
  })
  it('überspringt gestrichene und Nullpositionen', () => {
    const r = rechnungAusLv(lv([pos('01.01', 'A', 0, 5), pos('01.02', 'B', 1, 0), pos('01.03', 'C', 1, 5, { entfaellt: true }), pos('01.04', 'D', 2, 5)]))
    expect(r.positions).toHaveLength(1)
    expect(r.uebersprungen).toHaveLength(3)
  })
  it('meldet Rundungsdifferenz', () => {
    const r = rechnungAusLv(lv([pos('01.01', 'Plane', 3, 10.01, { faktorProzent: 33 })]))
    expect(r.positions[0].einzelpreis).toBe(3.3)
    expect(r.summeNetto).toBe(9.9)
    expect(r.rundungsDifferenz).toBe(-0.01) // Rechnung 9,90 − LV 9,91
  })
})
