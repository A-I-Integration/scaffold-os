import { describe, it, expect } from 'vitest'
import { spesenJeTag, spesenCsv } from '../spesen-export'

const A = 'aaaaaaaa-1111-4111-8111-111111111111', B = 'bbbbbbbb-2222-4222-8222-222222222222'
const tag = (employee_id: string, work_date: string, o: Record<string, unknown> = {}) => ({ employee_id, work_date, einsatzart: 'auswaerts_voll', vorschlag_tarif: 24, vorschlag_steuer: 28, betrag_manuell: null, ...o })

describe('Spesen-Export', () => {
  it('je Mitarbeiter und Tag zählt ein Betrag: Tagesberechnung geht vor Handeingabe, Manuelles vor Vorschlag', () => {
    const z = spesenJeTag(
      [{ employee_id: A, work_date: '2026-11-10', spesen_euro: 14 }, { employee_id: A, work_date: '2026-11-11', spesen_euro: 14 }, { employee_id: A, work_date: '2026-11-11', spesen_euro: 6 }, { employee_id: B, work_date: '2026-11-10', spesen_euro: 0 }],
      [tag(A, '2026-11-10'), tag(B, '2026-11-12', { betrag_manuell: 20.5 })])
    expect(z.map(x => [x.employee_id, x.work_date, x.betrag, x.quelle])).toEqual([
      [A, '2026-11-10', 24, 'Tagesberechnung'], [A, '2026-11-11', 20, 'Handeingabe'], [B, '2026-11-12', 20.5, 'Tagesberechnung, von Hand geändert']])
    expect(z[1].steuer).toBeNull()
  })
  it('CSV: Dezimalkomma, Anführungszeichen, Summe je Mitarbeiter und Auszahlungsmonat', () => {
    const z = spesenJeTag([], [tag(A, '2026-11-10'), tag(A, '2026-11-11', { einsatzart: 'heimfahrt', vorschlag_tarif: 3.5, vorschlag_steuer: 14 })])
    const csv = spesenCsv(z, { [A]: { nachname: 'Muster', vorname: 'Max', pnr: 'AAAAAAAA' } }, '2026-12')
    const zeilen = csv.split('\r\n')
    expect(zeilen[0]).toContain('Spesen Tarif/Hand (EUR)')
    expect(zeilen[1]).toBe('"AAAAAAAA";"Muster";"Max";10.11.2026;24;28;"Auswärtig – voller Tag";"Tagesberechnung";12/2026')
    expect(zeilen[2]).toContain('3,5;14;"Baustelle mit täglicher Heimfahrt"')
    expect(zeilen[3]).toBe('"AAAAAAAA";"Muster";"Max";"SUMME";27,5;;;;12/2026')
  })
  it('Zeilen unbekannter Mitarbeiter werden übersprungen', () => {
    expect(spesenCsv(spesenJeTag([], [tag(B, '2026-11-10')]), {}, null).split('\r\n')).toHaveLength(1)
  })
})
