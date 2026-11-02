import { describe, it, expect } from 'vitest'
import { lagerKonflikteBeiVerlaengerung, type OffenerTransport } from '../verlaengern-lager'

const t = (o: Partial<OffenerTransport>): OffenerTransport => ({ id: 't1', to_project_id: 'b', quantity: 20, planned_date: null, ziel_beginn: null, ziel_name: 'Baustelle B', artikel_name: 'Rahmen', ...o })

describe('lagerKonflikteBeiVerlaengerung', () => {
  it('Bedarf zwischen altem und neuem Ende ist ein Konflikt', () => {
    const r = lagerKonflikteBeiVerlaengerung('2026-11-10', '2026-11-17', [t({ planned_date: '2026-11-12' })])
    expect(r.konflikte).toEqual([{ transportId: 't1', zielName: 'Baustelle B', artikel: 'Rahmen', menge: 20, datum: '2026-11-12' }])
  })
  it('ohne geplantes Datum zählt der Projektbeginn der Zielbaustelle', () => {
    const r = lagerKonflikteBeiVerlaengerung('2026-11-10', '2026-11-17', [t({ ziel_beginn: '2026-11-10' })])
    expect(r.konflikte).toHaveLength(1)
  })
  it('Bedarf nach dem neuen Ende ist kein Konflikt', () => {
    expect(lagerKonflikteBeiVerlaengerung('2026-11-10', '2026-11-17', [t({ planned_date: '2026-11-17' })]).konflikte).toHaveLength(0)
    expect(lagerKonflikteBeiVerlaengerung('2026-11-10', '2026-11-17', [t({ planned_date: '2026-12-01' })]).konflikte).toHaveLength(0)
  })
  it('Bedarf vor dem alten Ende war schon vorher ein Widerspruch und wird nicht der Verlängerung zugerechnet', () => {
    expect(lagerKonflikteBeiVerlaengerung('2026-11-10', '2026-11-17', [t({ planned_date: '2026-11-05' })]).konflikte).toHaveLength(0)
  })
  it('ohne jedes Datum: undatiert, nichts geraten', () => {
    const r = lagerKonflikteBeiVerlaengerung('2026-11-10', '2026-11-17', [t({})])
    expect(r).toEqual({ konflikte: [], undatiert: 1 })
  })
  it('sortiert nach Datum', () => {
    const r = lagerKonflikteBeiVerlaengerung('2026-11-10', '2026-11-30', [t({ id: 'b', planned_date: '2026-11-20' }), t({ id: 'a', planned_date: '2026-11-12' })])
    expect(r.konflikte.map((k) => k.transportId)).toEqual(['a', 'b'])
  })
})
