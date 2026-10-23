import { describe, it, expect } from 'vitest'
import { arbeitstage, planeTeam, findeErsatz } from '../einsatz-planung'

const ma = ['anna', 'ben', 'cem', 'dora'].map((id) => ({ id, name: id }))

describe('Einsatzplanung', () => {
  it('Arbeitstage überspringen das Wochenende', () => {
    expect(arbeitstage('2026-10-23', 3)).toEqual(['2026-10-23', '2026-10-26', '2026-10-27']) // Fr, Mo, Di
    expect(arbeitstage('2026-10-24', 1)).toEqual(['2026-10-26']) // Sa → Mo
    expect(arbeitstage('quatsch', 3)).toEqual([])
  })
  it('plant nur Verfügbare ein und lässt Leute von Tag zu Tag dabei', () => {
    const tage = arbeitstage('2026-10-26', 3)
    const p = planeTeam({ tage, personen: 2, mitarbeiter: ma, einsaetze: [{ employee_id: 'anna', einsatz_datum: tage[0], project_id: 'x' }], abwesenheiten: [{ employee_id: 'ben', start_date: tage[1], end_date: tage[1] }] })
    expect(p[0].ids).toEqual(['ben', 'cem']) // anna hat Einsatz
    expect(p[1].ids).toContain('cem') // cem bleibt; ben ist im Urlaub
    expect(p[1].ids).not.toContain('ben')
    expect(p.every((t) => t.luecke === 0)).toBe(true)
  })
  it('meldet Lücken, wenn zu wenige frei sind; KI-Vorliebe bei Gleichstand', () => {
    const tage = arbeitstage('2026-10-26', 1)
    const p = planeTeam({ tage, personen: 3, mitarbeiter: ma.slice(0, 2), einsaetze: [], abwesenheiten: [] })
    expect(p[0].luecke).toBe(1)
    const k = planeTeam({ tage, personen: 1, mitarbeiter: ma, einsaetze: [], abwesenheiten: [], bevorzugt: ['dora'] })
    expect(k[0].ids).toEqual(['dora'])
  })
  it('Ersatz: frei, nicht abwesend, bevorzugt Leute vom selben Projekt', () => {
    const e = findeErsatz({
      datum: '2026-10-27', projectId: 'p1', ausgefallen: 'anna', mitarbeiter: ma,
      einsaetze: [{ employee_id: 'cem', einsatz_datum: '2026-10-26', project_id: 'p1' }, { employee_id: 'ben', einsatz_datum: '2026-10-27', project_id: 'p2' }],
      abwesenheiten: [],
    })
    expect(e).toBe('cem')
    expect(findeErsatz({ datum: '2026-10-27', projectId: 'p1', ausgefallen: 'anna', mitarbeiter: ma.slice(0, 1), einsaetze: [], abwesenheiten: [] })).toBeNull()
    expect(findeErsatz({ datum: '2026-10-27', projectId: null, ausgefallen: 'anna', mitarbeiter: ma, einsaetze: [], abwesenheiten: [{ employee_id: 'ben', start_date: '2026-10-27', end_date: '2026-10-28' }, { employee_id: 'cem', start_date: '2026-10-27', end_date: '2026-10-27' }] })).toBe('dora')
  })
})
