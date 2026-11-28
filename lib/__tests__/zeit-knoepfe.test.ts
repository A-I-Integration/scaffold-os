import { describe, it, expect } from 'vitest'
import { verfuegbareKnoepfe, uebergang, pruefeNachtrag, type Lauf } from '@/lib/zeit-knoepfe'
import { zusammenfassung } from '@/lib/zeit-abschnitte'

const jetzt = new Date('2026-11-28T12:00:00Z')
const lauf = (art: string, start: string, extra: Partial<Lauf> = {}): Lauf => ({ art, start_time: start, project_id: null, davor_art: null, ...extra })
const EMP = '11111111-1111-4111-8111-111111111111'

describe('Knöpfe je Zustand', () => {
  it('ohne laufenden Abschnitt: Abfahrt oder direkt Baustelle', () => {
    expect(verfuegbareKnoepfe(null).map((k) => k.aktion)).toEqual(['abfahrt', 'ankunft'])
  })
  it('auf der Baustelle: Pause, Fahrt zum Hof, zurück auf dem Hof, Stoppen', () => {
    expect(verfuegbareKnoepfe(lauf('baustelle', '2026-11-28T07:00:00Z')).map((k) => k.aktion)).toEqual(['pause', 'rueckfahrt', 'hof', 'stopp'])
  })
  it('in der Pause nur weiter oder stoppen', () => {
    expect(verfuegbareKnoepfe(lauf('pause', '2026-11-28T09:00:00Z')).map((k) => k.aktion)).toEqual(['pause_ende', 'stopp'])
  })
})

describe('Übergänge', () => {
  it('Tagesablauf: Hof → Baustelle → Pause → weiter → Rückfahrt → Hof', () => {
    let l: Lauf | null = null
    const schritt = (a: any, zeit: string) => {
      const e = uebergang(l, a, new Date(zeit), { zeit })
      expect(e.ok).toBe(true); if (!e.ok) throw new Error(e.fehler)
      l = e.neuerLauf; return e
    }
    schritt('abfahrt', '2026-11-28T06:30:00Z')
    const a = schritt('ankunft', '2026-11-28T07:15:00Z'); expect(a.abschliessen).toMatchObject({ art: 'fahrt_hof' })
    schritt('pause', '2026-11-28T09:00:00Z')
    const w = schritt('pause_ende', '2026-11-28T09:30:00Z'); expect(w.abschliessen).toMatchObject({ art: 'pause' }); expect(w.neuerLauf?.art).toBe('baustelle')
    schritt('rueckfahrt', '2026-11-28T15:00:00Z')
    const h = schritt('hof', '2026-11-28T15:45:00Z'); expect(h.neuerLauf).toBeNull(); expect(h.abschliessen).toMatchObject({ art: 'fahrt_zum_hof' })
  })
  it('nach der Pause geht es dort weiter, wo man war (Fahrt bleibt Fahrt)', () => {
    const p = uebergang(lauf('fahrt_hof', '2026-11-28T06:30:00Z'), 'pause', new Date('2026-11-28T07:00:00Z'))
    if (!p.ok) throw new Error(p.fehler)
    expect(p.neuerLauf?.davor_art).toBe('fahrt_hof')
    const w = uebergang(p.neuerLauf, 'pause_ende', new Date('2026-11-28T07:20:00Z'))
    expect(w).toMatchObject({ ok: true, neuerLauf: { art: 'fahrt_hof' } })
  })
  it('unpassender Knopf wird abgelehnt', () => {
    expect(uebergang(null, 'pause', jetzt).ok).toBe(false)
    expect(uebergang(lauf('baustelle', '2026-11-28T07:00:00Z'), 'abfahrt', jetzt).ok).toBe(false)
  })
  it('Zeit einstellen: nicht in der Zukunft, nicht vor dem Beginn', () => {
    expect(uebergang(null, 'abfahrt', jetzt, { zeit: '2026-11-28T14:00:00Z' }).ok).toBe(false)
    expect(uebergang(lauf('baustelle', '2026-11-28T10:00:00Z'), 'stopp', jetzt, { zeit: '2026-11-28T09:00:00Z' }).ok).toBe(false)
    expect(uebergang(lauf('baustelle', '2026-11-28T10:00:00Z'), 'stopp', jetzt, { zeit: 'kaputt' }).ok).toBe(false)
  })
  it('Abschnitt, der über 24 Stunden läuft, braucht eine eingestellte Endzeit', () => {
    const e = uebergang(lauf('baustelle', '2026-11-26T07:00:00Z'), 'stopp', jetzt)
    expect(e.ok).toBe(false)
    expect(uebergang(lauf('baustelle', '2026-11-26T07:00:00Z'), 'stopp', jetzt, { zeit: '2026-11-26T16:00:00Z' }).ok).toBe(true)
  })
  it('Baustelle wird in den nächsten Abschnitt mitgenommen', () => {
    const e = uebergang(lauf('baustelle', '2026-11-28T07:00:00Z', { project_id: 'p1' }), 'pause', jetzt)
    expect(e).toMatchObject({ ok: true, abschliessen: { project_id: 'p1' }, neuerLauf: { project_id: 'p1' } })
  })
})

describe('Nachtragen durch Mitarbeiter', () => {
  const ok = { art: 'baustelle', start_time: '2026-11-27T07:00:00Z', end_time: '2026-11-27T12:00:00Z' }
  it('gültig, gestern', () => expect(pruefeNachtrag(ok, EMP, jetzt).ok).toBe(true))
  it('nur eigene Arten', () => expect(pruefeNachtrag({ ...ok, art: 'fortbildung' }, EMP, jetzt).ok).toBe(false))
  it('nicht Zukunft, nicht älter als 7 Tage', () => {
    expect(pruefeNachtrag({ ...ok, end_time: '2026-11-29T12:00:00Z' }, EMP, jetzt).ok).toBe(false)
    expect(pruefeNachtrag({ ...ok, start_time: '2026-11-10T07:00:00Z', end_time: '2026-11-10T12:00:00Z' }, EMP, jetzt).ok).toBe(false)
  })
  it('Ende vor Beginn wird abgelehnt', () => expect(pruefeNachtrag({ ...ok, end_time: '2026-11-27T06:00:00Z' }, EMP, jetzt).ok).toBe(false))
})

describe('Zusammenfassung', () => {
  it('zählt aktiv gearbeitet und Pausen getrennt, laufender Abschnitt bis jetzt', () => {
    const z = zusammenfassung([
      { art: 'fahrt_hof', start_time: '2026-11-28T06:30:00Z', end_time: '2026-11-28T07:15:00Z' },
      { art: 'baustelle', start_time: '2026-11-28T07:15:00Z', end_time: '2026-11-28T09:00:00Z' },
      { art: 'pause', start_time: '2026-11-28T09:00:00Z', end_time: '2026-11-28T09:30:00Z' },
      { art: 'schlechtwetter', start_time: '2026-11-28T09:30:00Z', end_time: '2026-11-28T10:00:00Z' },
    ], { art: 'baustelle', start_time: '2026-11-28T10:00:00Z' }, jetzt)
    expect(z).toMatchObject({ fahrtMinuten: 45, baustelleMinuten: 105 + 120, pauseMinuten: 30, pauseAnzahl: 1, schlechtwetterMinuten: 30, aktivMinuten: 45 + 105 + 120, laeuft: true })
  })
})
