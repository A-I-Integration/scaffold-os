import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { werteAus, pruefeLand, vorkommendeLaender, auswertungCsv, auswertungZeilen, summenZeilen, AUSWERTUNG_KOPF, SUMMEN_KOPF } from '../auswertung'
import { excelDatei } from '../excel-liste'

const MA = [{ id: 'a', first_name: 'Anna', last_name: 'Arnold' }, { id: 'b', first_name: 'Ben', last_name: 'Berg' }]
const P_DE = { id: 'p1', name: 'Hamburg', land: null }
const P_AT = { id: 'p2', name: 'Wien', land: 'Österreich' }
const e = (employee_id: string, work_date: string, hours: number, project: any = P_DE) => ({ employee_id, work_date, hours, project_id: project?.id, project })
const DATEN = [
  e('a', '2026-11-02', 8), e('a', '2026-11-03', 9.5), e('a', '2026-11-04', 4, P_AT), e('a', '2026-11-04', 5, P_DE),
  e('b', '2026-11-03', 10, P_AT), e('b', '2026-11-05', 8.25),
]
const opt = (o: Partial<Parameters<typeof werteAus>[2]> = {}) => ({ employeeIds: [], schwelleStunden: null, land: '', ...o })

describe('Auswertung', () => {
  it('ohne Filter: alle Tage, Stunden je Tag summiert', () => {
    const { tage, summen } = werteAus(DATEN, MA, opt())
    expect(tage).toHaveLength(5)
    expect(tage.find(t => t.employee_id === 'a' && t.work_date === '2026-11-04')?.stunden).toBe(9)
    expect(summen.find(s => s.employee_id === 'a')).toMatchObject({ tage: 3, stunden: 26.5 })
  })
  it('über 8 h heißt mehr als 8: genau 8 zählt nicht', () => {
    const { tage, summen } = werteAus(DATEN, MA, opt({ schwelleStunden: 8 }))
    expect(tage.map(t => `${t.employee_id}${t.work_date.slice(8)}`)).toEqual(['a03', 'a04', 'b03', 'b05'])
    expect(summen.find(s => s.employee_id === 'a')?.mehrAlsSchwelle).toBe(2.5)
  })
  it('Mitarbeiter-Auswahl', () => {
    const { tage } = werteAus(DATEN, MA, opt({ employeeIds: ['b'] }))
    expect(new Set(tage.map(t => t.employee_id))).toEqual(new Set(['b']))
  })
  it('Land: Tage mit Buchung im Land, Anteil im Land; unbekanntes Land = Deutschland', () => {
    const at = werteAus(DATEN, MA, opt({ land: 'Österreich' })).tage
    expect(at.map(t => t.name + t.work_date.slice(8))).toEqual(['Arnold, Anna04', 'Berg, Ben03'])
    expect(at[0]).toMatchObject({ stunden: 9, stundenImLand: 4, laender: ['Deutschland', 'Österreich'] })
    const de = werteAus(DATEN, MA, opt({ land: 'Deutschland' })).tage
    expect(de).toHaveLength(4)
  })
  it('Kombination: Mitarbeiter + über 8 h + Land', () => {
    const { tage } = werteAus(DATEN, MA, opt({ employeeIds: ['a'], schwelleStunden: 8, land: 'Österreich' }))
    expect(tage).toHaveLength(1)
    expect(tage[0].work_date).toBe('2026-11-04')
  })
  it('Tage ohne Stunden (laufender Stempel) werden nicht gezählt', () => {
    expect(werteAus([{ employee_id: 'a', work_date: '2026-11-09', hours: null }], MA, opt()).tage).toHaveLength(0)
  })
  it('Länder-Liste enthält Deutschland und vorkommende', () => {
    expect(vorkommendeLaender(DATEN)).toEqual(['Deutschland', 'Österreich'])
  })
  it('Land prüfen', () => {
    expect(pruefeLand('  Österreich ')).toEqual({ ok: true, land: 'Österreich' })
    expect(pruefeLand('')).toEqual({ ok: true, land: null })
    expect(pruefeLand('x'.repeat(61)).ok).toBe(false)
    expect(pruefeLand('<b>').ok).toBe(false)
  })
  it('CSV mit Komma-Dezimal; Excel mit echten Zahlen', () => {
    const { tage, summen } = werteAus(DATEN, MA, opt({ schwelleStunden: 8 }))
    expect(auswertungCsv(tage).split('\r\n')[2]).toBe('"Arnold, Anna";"04.11.2026";9;9;"Deutschland, Österreich";"Hamburg, Wien"')
    const wb = XLSX.read(excelDatei([{ name: 'Tage', kopf: AUSWERTUNG_KOPF, zeilen: auswertungZeilen(tage) }, { name: 'Summen', kopf: SUMMEN_KOPF, zeilen: summenZeilen(summen) }]), { type: 'array' })
    expect(wb.SheetNames).toEqual(['Tage', 'Summen'])
    const z = XLSX.utils.sheet_to_json<any>(wb.Sheets['Tage'])
    expect(z).toHaveLength(4)
    expect(z[1]['Stunden']).toBe(9)
    expect(typeof z[0]['Stunden']).toBe('number')
  })
})
