import { describe, it, expect } from 'vitest'
import { bereinigePosition, positionDetailZeilen } from '@/lib/rechnung-position'
import { geruestPositionen } from '@/lib/aufmass-rechnung'

describe('Gerüst-ID und Bemerkung je Position', () => {
  it('werden übernommen, gekürzt und leer verworfen', () => {
    const p = bereinigePosition({ bezeichnung: 'Schultertransport', menge: 1, einheit: 'psch', einzelpreis: 120, geruestId: '  Nebengebäude Ost ', bemerkung: 'x'.repeat(1200) })
    expect(p.geruestId).toBe('Nebengebäude Ost')
    expect(p.bemerkung).toHaveLength(1000)
    expect(bereinigePosition({ bezeichnung: 'a', geruestId: '  ', bemerkung: '' })).not.toHaveProperty('geruestId')
  })
  it('erscheinen in den Detailzeilen (Gerüst zuerst, Bemerkung zuletzt)', () => {
    const z = positionDetailZeilen({ art: 'sonstiges', geruestId: 'Hauptgebäude Süd', taetigkeit: 'Transport', bemerkung: 'Kunde kann nicht näher parken' })
    expect(z[0]).toBe('Gerüst: Hauptgebäude Süd')
    expect(z[z.length - 1]).toBe('Bemerkung: Kunde kann nicht näher parken')
  })
  it('Aufmaß-Abschnitte werden zur Gerüst-ID', () => {
    const r = geruestPositionen({ basis: 1000, flaecheM2: 100, festpreisProM2: 10, abschnitte: [{ bezeichnung: 'Hauptgebäude Süd', areaM2: 60 }, { bezeichnung: 'Nebengebäude Ost', areaM2: 40 }], pauschaleText: 'P' })
    expect(r.map((x) => x.geruestId)).toEqual(['Hauptgebäude Süd', 'Nebengebäude Ost'])
  })
})
