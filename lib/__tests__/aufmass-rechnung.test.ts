import { describe, it, expect } from 'vitest'
import { geruestPositionen } from '@/lib/aufmass-rechnung'

const summe = (p: { menge: number; einzelpreis: number }[]) => Math.round(p.reduce((s, x) => s + x.menge * x.einzelpreis, 0) * 100) / 100

describe('geruestPositionen', () => {
  const ab = [{ bezeichnung: 'Nordseite', areaM2: 100 }, { bezeichnung: 'Ostseite', areaM2: 52.29 }, { bezeichnung: 'Giebel', areaM2: 300 }]
  it('Festpreis mit Abschnitten: m² × €/m² je Abschnitt', () => {
    const r = geruestPositionen({ basis: 4522.9, flaecheM2: 452.29, festpreisProM2: 10, abschnitte: ab, pauschaleText: 'X' })
    expect(r).toHaveLength(3)
    expect(r[0]).toMatchObject({ bezeichnung: 'Gerüst Nordseite', menge: 100, einheit: 'm²', einzelpreis: 10 })
    expect(summe(r)).toBe(4522.9)
  })
  it('Festpreis ohne Abschnitte: eine Position m² × €/m²', () => {
    const r = geruestPositionen({ basis: 4522.9, flaecheM2: 452.29, festpreisProM2: 10, pauschaleText: 'X' })
    expect(r).toEqual([{ bezeichnung: 'Gerüstbau gemäß Angebot', menge: 452.29, einheit: 'm²', einzelpreis: 10, art: 'geruest' }])
  })
  it('Kalkulationspreis: Anteile nach Fläche, Summe exakt', () => {
    const r = geruestPositionen({ basis: 9999.99, flaecheM2: 452.29, abschnitte: ab, pauschaleText: 'X' })
    expect(r).toHaveLength(3)
    expect(r[0].bezeichnung).toContain('100,00 m²')
    expect(summe(r)).toBe(9999.99)
  })
  it('ohne Aufteilung oder bei Abweichung: Pauschale mit Text', () => {
    expect(geruestPositionen({ basis: 500, flaecheM2: 0, pauschaleText: 'Gerüstbau (Material)' })).toEqual([{ bezeichnung: 'Gerüstbau (Material)', menge: 1, einheit: 'Pauschale', einzelpreis: 500, art: 'geruest' }])
    const r = geruestPositionen({ basis: 5000, flaecheM2: 452.29, festpreisProM2: 10, pauschaleText: 'P' })
    expect(r[0].einheit).toBe('Pauschale')
    expect(summe(r)).toBe(5000)
  })
  it('Festpreis passt nicht zur Basis: Aufteilung nach Anteil, Summe bleibt', () => {
    const r = geruestPositionen({ basis: 4000, flaecheM2: 452.29, festpreisProM2: 10, abschnitte: ab, pauschaleText: 'P' })
    expect(r.every((x) => x.einheit === 'Pauschale')).toBe(true)
    expect(summe(r)).toBe(4000)
  })
  it('Basis 0 → Pauschale', () => {
    expect(geruestPositionen({ basis: 0, flaecheM2: 10, pauschaleText: 'P' })[0].einzelpreis).toBe(0)
  })
})
