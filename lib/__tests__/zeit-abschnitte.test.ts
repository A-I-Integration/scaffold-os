import { describe, it, expect } from 'vitest'
import { pruefeAbschnitt, ueberschneidet, tageszeile, berlinDatum, OHNE_ZULAGEN } from '../zeit-abschnitte'

const E = '11111111-1111-4111-8111-111111111111'
const t = (h: string) => `2026-11-10T${h}:00+01:00`

describe('Tagesabschnitte', () => {
  it('prüft Eingaben', () => {
    const ok = pruefeAbschnitt({ employee_id: E, art: 'fahrt_hof', start_time: t('06:30'), end_time: t('07:15'), work_date: '2026-11-10' })
    expect(ok.ok).toBe(true)
    for (const k of [{ employee_id: 'x' }, { art: 'urlaub' }, { end_time: t('06:00') }, { start_time: 'abc' }, { work_date: '2026-11-11' }, { project_id: 'nix' }]) {
      expect(pruefeAbschnitt({ employee_id: E, art: 'pause', start_time: t('09:00'), end_time: t('09:30'), work_date: '2026-11-10', ...k }).ok).toBe(false)
    }
  })
  it('Tag wird in deutscher Zeit bestimmt', () => {
    expect(berlinDatum('2026-11-10T23:30:00Z')).toBe('2026-11-11')
    expect(berlinDatum('2026-07-10T21:30:00Z')).toBe('2026-07-10')
  })
  it('erkennt Überschneidung, Ändern des eigenen Abschnitts ist erlaubt', () => {
    const v = [{ id: 'a', start_time: t('09:00'), end_time: t('09:30') }]
    expect(ueberschneidet({ start_time: t('09:15'), end_time: t('10:00') }, v)).toBe(true)
    expect(ueberschneidet({ start_time: t('09:30'), end_time: t('10:00') }, v)).toBe(false)
    expect(ueberschneidet({ start_time: t('09:15'), end_time: t('10:00') }, v, 'a')).toBe(false)
  })
  it('fasst den Tag zusammen und nennt Auffälligkeiten', () => {
    const e = [{ employee_id: E, start_time: t('06:30'), end_time: t('15:30'), hours: 8.25, break_minutes: 45 }]
    const a = [
      { employee_id: E, work_date: '2026-11-10', art: 'fahrt_hof', start_time: t('06:30'), end_time: t('07:15') },
      { employee_id: E, work_date: '2026-11-10', art: 'baustelle', start_time: t('07:15'), end_time: t('12:00') },
      { employee_id: E, work_date: '2026-11-10', art: 'pause', start_time: t('12:00'), end_time: t('12:30') },
    ]
    const z = tageszeile(E, e, a)
    expect(z.bruttoMinuten).toBe(540)
    expect(z.minuten).toMatchObject({ fahrt_hof: 45, baustelle: 285, pause: 30 })
    expect(z.hinweise.join(' ')).toContain('Pause: 30 min eingetragen, die Stempelzeit zieht 45 min ab')
    expect(z.hinweise.join(' ')).toContain('keinem Abschnitt zugeordnet')
  })
  it('meldet fehlendes Ausstempeln und Abschnitte außerhalb der Stempelzeit', () => {
    expect(tageszeile(E, [{ employee_id: E, start_time: t('06:30'), end_time: null, hours: null, break_minutes: 0 }], []).hinweise[0]).toContain('nicht ausgestempelt')
    const z = tageszeile(E, [{ employee_id: E, start_time: t('07:00'), end_time: t('15:00'), hours: 7.5, break_minutes: 30 }], [{ employee_id: E, work_date: '2026-11-10', art: 'baustelle', start_time: t('06:00'), end_time: t('07:30') }])
    expect(z.hinweise.join(' ')).toContain('außerhalb der Stempelzeit')
  })
  it('Fortbildung ist als „ohne Zulagen“ markiert', () => { expect(OHNE_ZULAGEN).toEqual(['fortbildung']) })
})
