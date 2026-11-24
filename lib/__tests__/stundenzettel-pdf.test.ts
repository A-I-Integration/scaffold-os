import { describe, it, expect } from 'vitest'
import { baueStundenzettel } from '../stundenzettel'
import { erzeugeStundenzettelPdf, stundenzettelPdfDateiname, monatDe } from '../stundenzettel-pdf'

describe('Stundenzettel-PDF', () => {
  const zettel = baueStundenzettel([
    { employee_id: 'e1', work_date: '2026-11-10', start_time: '2026-11-10T05:00:00Z', end_time: '2026-11-10T14:15:00Z', hours: 8.5, break_minutes: 45, project_id: 'p1', fahrzeit_minuten: 30, spesen_euro: 14 },
  ], '2026-11')
  it('erzeugt ein PDF mit Seite und Dateinamen', () => {
    const doc = erzeugeStundenzettelPdf({ mitarbeiter: 'Max Muster', zettel, projektName: () => 'Haus Müller', firma: { name: 'Test GmbH' } })
    expect(doc.getNumberOfPages()).toBe(1)
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1500)
    expect(stundenzettelPdfDateiname('Max Muster', '2026-11')).toBe('Stundenzettel_Max_Muster_2026-11.pdf')
    expect(monatDe('2026-11')).toContain('November')
  })
  it('leerer Monat erzeugt trotzdem ein gültiges PDF', () => {
    const doc = erzeugeStundenzettelPdf({ mitarbeiter: 'Max Muster', zettel: baueStundenzettel([], '2026-11'), projektName: () => '–' })
    expect(doc.getNumberOfPages()).toBe(1)
  })
})
