import { describe, it, expect } from 'vitest'
import { sammleStammFristen, sammleDokumentFristen, neueErinnerungen } from '../personal-fristen'

const HEUTE = '2026-11-24'
const ma = [
  { id: 'a', first_name: 'Max', last_name: 'Muster', status: 'active', license_expires: '2026-12-10' },
  { id: 'b', first_name: 'Ina', last_name: 'Alt', status: 'inactive', license_expires: '2026-12-01' },
]
describe('Fristen aus Stamm und Dokumenten', () => {
  it('sammelt Ausweis, Reisepass und Führerschein nur für aktive Mitarbeiter', () => {
    const f = sammleStammFristen(ma, [
      { employee_id: 'a', ausweisart: 'aufenthaltstitel', ausweis_gueltig_bis: '2026-12-20', reisepass_gueltig_bis: '2030-01-01' },
      { employee_id: 'b', ausweisart: 'personalausweis', ausweis_gueltig_bis: '2026-12-02' },
    ])
    expect(f.map(x => [x.schluessel, x.was])).toEqual([['ausweis:a', 'Aufenthaltstitel'], ['reisepass:a', 'Reisepass'], ['fuehrerschein:a', 'Führerschein']])
  })
  it('Dokumente ohne Ablaufdatum oder von inaktiven Mitarbeitern zählen nicht', () => {
    const f = sammleDokumentFristen(ma, [{ id: 'd1', employee_id: 'a', bezeichnung: 'G 41', gueltig_bis: '2026-12-15' }, { id: 'd2', employee_id: 'a', bezeichnung: 'Ausweis', gueltig_bis: null }, { id: 'd3', employee_id: 'b', bezeichnung: 'X', gueltig_bis: '2026-12-15' }])
    expect(f).toEqual([{ schluessel: 'dokument:d1', employee_id: 'a', mitarbeiter: 'Max Muster', was: 'G 41', gueltig_bis: '2026-12-15' }])
  })
})

describe('Erinnerung einen Monat vorher', () => {
  const fr = (schluessel: string, gueltig_bis: string) => ({ schluessel, employee_id: 'a', mitarbeiter: 'Max Muster', was: 'X', gueltig_bis })
  it('meldet 0 bis 30 Tage vor Ablauf, nicht früher und nicht überfällige', () => {
    const l = [fr('1', '2026-12-24'), fr('2', '2026-12-25'), fr('3', '2026-11-24'), fr('4', '2026-11-23')]
    expect(neueErinnerungen(l, new Set(), HEUTE).map(x => x.schluessel)).toEqual(['3', '1'])
  })
  it('meldet je Frist und Ablaufdatum nur einmal; neues Datum startet neu', () => {
    const gesendet = new Set(['1|2026-12-01'])
    expect(neueErinnerungen([fr('1', '2026-12-01')], gesendet, HEUTE)).toHaveLength(0)
    expect(neueErinnerungen([fr('1', '2026-12-20')], gesendet, HEUTE)).toHaveLength(1)
  })
})
