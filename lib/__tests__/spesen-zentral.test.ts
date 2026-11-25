import { describe, it, expect } from 'vitest'
import { verteileSpesen, verteileCents } from '../spesen-zentral'

const A = 'aaaaaaaa-1111-4111-8111-111111111111', B = 'bbbbbbbb-2222-4222-8222-222222222222'
const P1 = 'p1', P2 = 'p2', P3 = 'p3'
const tag = (employee_id: string, work_date: string, o: Record<string, unknown> = {}) => ({ employee_id, work_date, einsatzart: 'auswaerts_voll', vorschlag_tarif: 24, vorschlag_steuer: 28, betrag_manuell: null, ...o })
const b = (employee_id: string, work_date: string, project_id: string | null, hours: number | null, spesen_euro: number | null = null) => ({ employee_id, work_date, project_id, hours, spesen_euro })

describe('Spesen zentral', () => {
  it('Cent-Verteilung erhält die Summe exakt und ist nie negativ', () => {
    expect(verteileCents(1000, [1, 1, 1])).toEqual([334, 333, 333])
    expect(verteileCents(2400, [6, 2])).toEqual([1800, 600])
    expect(verteileCents(0, [1, 2])).toEqual([0, 0]); expect(verteileCents(100, [0, 0])).toEqual([0, 0])
    for (let n = 1; n < 40; n++) { const g = Array.from({ length: n % 6 + 1 }, (_, i) => ((i * 7 + n) % 5) + 1); const v = verteileCents(n * 37, g); expect(v.reduce((s, x) => s + x, 0)).toBe(n * 37); expect(v.every(x => x >= 0)).toBe(true) }
  })
  it('KEINE doppelte Zählung: mit Tagesberechnung zählt die Handeingabe dieses Tages nicht', () => {
    const v = verteileSpesen([b(A, '2026-11-10', P1, 8, 14), b(A, '2026-11-10', P1, 0.5, 14)], [tag(A, '2026-11-10')])
    expect(v.gesamt).toBe(24); expect(v.jeBuchung.reduce((s, x) => s + x, 0)).toBe(24)
  })
  it('ohne Tagesberechnung zählt die Handeingabe wie bisher, je Buchung', () => {
    const v = verteileSpesen([b(A, '2026-11-10', P1, 8, 14), b(A, '2026-11-11', P2, 8, 6.5), b(A, '2026-11-12', P2, 8, null)], [])
    expect(v.jeBuchung).toEqual([14, 6.5, 0]); expect(v.gesamt).toBe(20.5)
  })
  it('mehrere Baustellen an einem Tag: Verteilung nach Stunden, Summe bleibt', () => {
    const v = verteileSpesen([b(A, '2026-11-10', P1, 6), b(A, '2026-11-10', P2, 2)], [tag(A, '2026-11-10')])
    expect(v.jeBuchung).toEqual([18, 6])
    const drei = verteileSpesen([b(A, '2026-11-10', P1, 1), b(A, '2026-11-10', P2, 1), b(A, '2026-11-10', P3, 1)], [tag(A, '2026-11-10', { betrag_manuell: 10 })])
    expect(drei.jeBuchung.reduce((s, x) => Math.round((s + x) * 100) / 100, 0)).toBe(10); expect(drei.jeBuchung[0]).toBe(3.34)
  })
  it('von Hand geänderter Betrag hat Vorrang vor dem Vorschlag, auch 0 €', () => {
    expect(verteileSpesen([b(A, '2026-11-10', P1, 8)], [tag(A, '2026-11-10', { betrag_manuell: 20.5 })]).jeBuchung).toEqual([20.5])
    expect(verteileSpesen([b(A, '2026-11-10', P1, 8, 14)], [tag(A, '2026-11-10', { betrag_manuell: 0 })]).gesamt).toBe(0)
  })
  it('mehrere Mitarbeiter am selben Tag werden getrennt gerechnet', () => {
    const v = verteileSpesen([b(A, '2026-11-10', P1, 8), b(B, '2026-11-10', P1, 8, 5)], [tag(A, '2026-11-10')])
    expect(v.jeBuchung).toEqual([24, 5])
  })
  it('Tag ohne Buchung mit Stunden oder ohne jede Buchung: Betrag bleibt sichtbar, nichts geht verloren', () => {
    const v = verteileSpesen([b(A, '2026-11-10', P1, null), b(A, '2026-11-10', P1, 0)], [tag(A, '2026-11-10'), tag(B, '2026-11-12')])
    expect(v.jeBuchung).toEqual([0, 0]); expect(v.ohneZuordnung.map(o => [o.employee_id, o.betrag])).toEqual([[A, 24], [B, 24]]); expect(v.gesamt).toBe(48)
  })
  it('Buchungen ohne Baustelle bekommen ihren Anteil', () => {
    expect(verteileSpesen([b(A, '2026-11-10', null, 4), b(A, '2026-11-10', P1, 4)], [tag(A, '2026-11-10')]).jeBuchung).toEqual([12, 12])
  })
})
