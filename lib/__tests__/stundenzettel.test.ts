import { describe, it, expect } from 'vitest'
import { baueStundenzettel, berechneLohnkosten, monatsGrenzen, type ZeitBuchung } from '../stundenzettel'

const b = (o: Partial<ZeitBuchung>): ZeitBuchung => ({ employee_id: 'e1', work_date: '2026-11-10', hours: 8, ...o })

describe('Stundenzettel', () => {
  it('Monatsgrenzen inkl. Schaltjahr; ungültig = null', () => {
    expect(monatsGrenzen('2026-11')).toEqual({ von: '2026-11-01', bis: '2026-11-30' })
    expect(monatsGrenzen('2028-02')).toEqual({ von: '2028-02-01', bis: '2028-02-29' })
    expect(monatsGrenzen('2026-13')).toBeNull(); expect(monatsGrenzen('x')).toBeNull()
  })
  it('Tage sortiert, Von/Bis in deutscher Zeit, Summen, andere Monate ignoriert', () => {
    const z = baueStundenzettel([
      b({ work_date: '2026-11-12', start_time: '2026-11-12T05:30:00Z', end_time: '2026-11-12T14:00:00Z', hours: 8, break_minutes: 30, fahrzeit_minuten: 20, spesen_euro: '14', project_id: 'p1' }),
      b({ work_date: '2026-11-10', start_time: '2026-11-10T05:00:00Z', end_time: '2026-11-10T14:15:00Z', hours: 8.5, break_minutes: 45 }),
      b({ work_date: '2026-10-31', hours: 8 }), b({ work_date: '2026-12-01', hours: 8 }),
    ], '2026-11')
    expect(z.zeilen.map((x) => x.datum)).toEqual(['2026-11-10', '2026-11-12'])
    expect(z.zeilen[0]).toMatchObject({ von: '06:00', bis: '15:15', pauseMin: 45, stunden: 8.5 })
    expect(z.zeilen[1]).toMatchObject({ von: '06:30', bis: '15:00', projektId: 'p1', fahrzeitMin: 20, spesen: 14 })
    expect(z.summe).toEqual({ tage: 2, stunden: 16.5, pauseMin: 75, fahrzeitMin: 20, spesen: 14 })
  })
  it('laufende Buchung wird als offen gekennzeichnet und zählt nicht als Tag', () => {
    const z = baueStundenzettel([b({ start_time: '2026-11-10T05:00:00Z', end_time: null, hours: null })], '2026-11')
    expect(z.zeilen[0].offen).toBe(true); expect(z.summe.tage).toBe(0); expect(z.summe.stunden).toBe(0)
  })
  it('Zahlen als Text und kaputte Werte werden abgefangen', () => {
    const z = baueStundenzettel([b({ hours: '7.5', break_minutes: -5, spesen_euro: 'abc' })], '2026-11')
    expect(z.zeilen[0]).toMatchObject({ stunden: 7.5, pauseMin: 0, spesen: 0 })
  })
})

describe('Lohnkosten je Baustelle', () => {
  const loehne = { e1: [{ stundenlohn: 20, gueltig_ab: '2026-01-01' }, { stundenlohn: 22, gueltig_ab: '2026-11-15' }], e2: [{ stundenlohn: 18.5, gueltig_ab: '2026-01-01' }] }
  it('bewertet mit dem Lohn des Arbeitstags und summiert je Baustelle', () => {
    const k = berechneLohnkosten([
      b({ work_date: '2026-11-10', hours: 8, project_id: 'p1' }),               // 160
      b({ work_date: '2026-11-16', hours: 8, project_id: 'p1' }),               // 176 (neuer Lohn)
      b({ employee_id: 'e2', work_date: '2026-11-10', hours: 8, project_id: 'p1' }), // 148
      b({ employee_id: 'e2', work_date: '2026-11-11', hours: 4, project_id: 'p2' }), // 74
    ], loehne)
    expect(k.baustellen.map((x) => [x.projectId, x.stunden, x.kosten])).toEqual([['p1', 24, 484], ['p2', 4, 74]])
    expect(k.baustellen[0].mitarbeiter).toEqual([{ employeeId: 'e1', stunden: 16, kosten: 336 }, { employeeId: 'e2', stunden: 8, kosten: 148 }])
    expect(k.summe).toEqual({ stunden: 28, kosten: 558 })
    expect(k.ohneLohn.stunden).toBe(0)
  })
  it('Stunden ohne Lohn werden getrennt ausgewiesen statt mit 0 € bewertet', () => {
    const k = berechneLohnkosten([b({ employee_id: 'e3', hours: 6, project_id: 'p1' }), b({ work_date: '2025-12-31', hours: 8, project_id: 'p1' })], loehne)
    expect(k.baustellen).toEqual([]); expect(k.summe.kosten).toBe(0); expect(k.summe.stunden).toBe(14)
    expect(k.ohneLohn).toEqual({ stunden: 14, mitarbeiter: [{ employeeId: 'e3', stunden: 6 }, { employeeId: 'e1', stunden: 8 }] })
  })
  it('Buchungen ohne Baustelle bilden eine eigene Zeile; Cent-Rundung je Buchung', () => {
    const k = berechneLohnkosten([b({ hours: 7.33, project_id: null }), b({ hours: 7.33, project_id: null })], { e1: [{ stundenlohn: 17.09, gueltig_ab: '2026-01-01' }] })
    expect(k.baustellen[0]).toMatchObject({ projectId: null, stunden: 14.66 })
    expect(k.baustellen[0].kosten).toBe(250.54) // je Buchung 7,33 × 17,09 = 125,2697 → 125,27 €, zweimal = 250,54 €
  })
})

describe('Stundenzettel mit Tages-Spesen', () => {
  const buch = [
    { employee_id: 'e1', work_date: '2026-11-10', hours: 4, spesen_euro: 14, start_time: '2026-11-10T06:00:00Z', end_time: '2026-11-10T10:00:00Z' },
    { employee_id: 'e1', work_date: '2026-11-10', hours: 4, spesen_euro: 14, start_time: '2026-11-10T11:00:00Z', end_time: '2026-11-10T15:00:00Z' },
    { employee_id: 'e1', work_date: '2026-11-11', hours: 8, spesen_euro: 6, start_time: '2026-11-11T06:00:00Z', end_time: '2026-11-11T14:00:00Z' },
  ]
  it('ohne Tagesberechnung bleibt alles wie bisher', () => {
    expect(baueStundenzettel(buch, '2026-11').summe.spesen).toBe(34)
  })
  it('Tagesberechnung ersetzt die Handeingaben dieses Tages, steht einmal pro Tag; andere Tage bleiben', () => {
    const z = baueStundenzettel(buch, '2026-11', [{ work_date: '2026-11-10', betrag: 24 }])
    expect(z.zeilen.map(x => x.spesen)).toEqual([24, 0, 6]); expect(z.summe.spesen).toBe(30)
  })
  it('Tag mit Spesen aber ohne Buchung bekommt eine eigene Zeile; andere Monate werden ignoriert', () => {
    const z = baueStundenzettel(buch, '2026-11', [{ work_date: '2026-11-20', betrag: 12 }, { work_date: '2026-10-31', betrag: 99 }])
    expect(z.zeilen.at(-1)).toMatchObject({ datum: '2026-11-20', spesen: 12, stunden: 0 }); expect(z.summe.spesen).toBe(46); expect(z.summe.tage).toBe(2)
  })
})
