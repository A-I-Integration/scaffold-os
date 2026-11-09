import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'
import { computeNetHours, autoBreakMinutes } from '@/lib/worktime'
import { pruefeZeitFelder } from '@/lib/zeit-validierung'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'

const rolle = vi.hoisted(() => ({ wert: 'admin' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: rolle.wert } }) }) }) }),
  }),
}))
vi.mock('@/lib/auth', async () => {
  const echt = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return {
    ...echt,
    requireAuth: async () => true,
    requireOwnEmployeeOrAdmin: async () => ({ allowed: true }),
    pruefeRolle: async () => ({ ok: true, userId: 'u1', role: rolle.wert }),
  }
})

let db: Tabellen
beforeEach(() => { rolle.wert = 'admin'; db = { employees: [{ id: 'e1', first_name: 'A', last_name: 'B' }], time_entries: [] } })

describe('Pausen- und Stundenrechnung', () => {
  const iso = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 5, h, m)).toISOString()
  it.each([
    [5.99, 0], [6, 0], [6.01, 30], [9, 30], [9.01, 45], [12, 45],
  ])('brutto %s h → Pause %s min (Gesetz: mehr als 6 h / mehr als 9 h)', (h, pause) => expect(autoBreakMinutes(h * 3600000)).toBe(pause))
  it('8 Stunden brutto → 7,5 Stunden netto', () => expect(computeNetHours(iso(7), iso(15))).toEqual({ hours: 7.5, breakMinutes: 30 }))
  it('genau 9 Stunden brutto → 8,5 Stunden netto (30 min)', () => expect(computeNetHours(iso(7), iso(16))).toEqual({ hours: 8.5, breakMinutes: 30 }))
  it('9:30 Stunden brutto → 8,75 Stunden netto (45 min)', () => expect(computeNetHours(iso(7), iso(16, 30))).toEqual({ hours: 8.75, breakMinutes: 45 }))
  it('7:00–7:20 → 0,33 Stunden, keine Pause', () => expect(computeNetHours(iso(7), iso(7, 20))).toEqual({ hours: 0.33, breakMinutes: 0 }))
  it('Ende vor oder gleich Start → null', () => { expect(computeNetHours(iso(8), iso(7))).toBeNull(); expect(computeNetHours(iso(8), iso(8))).toBeNull() })
  it('Schicht über Mitternacht wird als Dauer gerechnet', () => {
    expect(computeNetHours(new Date(Date.UTC(2026, 0, 5, 22)).toISOString(), new Date(Date.UTC(2026, 0, 6, 6)).toISOString())).toEqual({ hours: 7.5, breakMinutes: 30 })
  })
})

describe('Prüfung der Zeit-Felder', () => {
  it.each([[{ hours: -8 }], [{ hours: 25 }], [{ hours: 'abc' }], [{ break_minutes: -1 }], [{ break_minutes: 601 }], [{ spesen_euro: -5 }], [{ fahrzeit_minuten: 5000 }], [{ work_date: '5.1.2026' }], [{ work_date: '2026-13-45' }]])('%j wird abgewiesen', (b) => {
    expect(pruefeZeitFelder(b as never)).not.toBeNull()
  })
  it.each([[{ hours: 8 }], [{ hours: '7,5' }], [{ hours: 0 }], [{ break_minutes: 30, spesen_euro: 12.5, fahrzeit_minuten: 45, work_date: '2026-01-05' }], [{}]])('%j ist gültig', (b) => {
    expect(pruefeZeitFelder(b as never)).toBeNull()
  })
})

describe('Zeiterfassung (Büro): Eingaben werden geprüft', () => {
  const post = async (body: object) => (await import('@/app/api/zeiterfassung/route')).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)
  const put = async (body: object) => (await import('@/app/api/zeiterfassung/route')).PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }) as never)
  beforeEach(() => vi.stubGlobal('fetch', baueFakeRest(db)))

  it('Nachtragen mit negativen Stunden wird abgewiesen, nichts gespeichert', async () => {
    const r = await post({ employee_id: 'e1', work_date: '2026-01-05', hours: -8 })
    expect(r.status).toBe(400); expect(db.time_entries).toHaveLength(0)
  })
  it('Nachtragen mit 900 Stunden wird abgewiesen', async () => {
    expect((await post({ employee_id: 'e1', work_date: '2026-01-05', hours: 900 })).status).toBe(400)
  })
  it('Nachtragen mit Von/Bis rechnet Pause und Netto', async () => {
    const r = await post({ employee_id: 'e1', work_date: '2026-01-05', start_time: '2026-01-05T07:00:00Z', end_time: '2026-01-05T15:00:00Z' })
    expect(r.status).toBe(200)
    expect(db.time_entries[0]).toMatchObject({ hours: 7.5, break_minutes: 30 })
  })
  it('Ende vor Start wird abgewiesen', async () => {
    expect((await post({ employee_id: 'e1', work_date: '2026-01-05', start_time: '2026-01-05T15:00:00Z', end_time: '2026-01-05T07:00:00Z' })).status).toBe(400)
  })
  it('Korrigieren mit unsinnigen Spesen wird abgewiesen', async () => {
    db.time_entries.push({ id: 't1', employee_id: 'e1', hours: 8 })
    expect((await put({ id: 't1', spesen_euro: -50 })).status).toBe(400)
    expect(db.time_entries[0].spesen_euro).toBeUndefined()
  })
  it('Disponent darf nachtragen, Bauleiter nicht', async () => {
    rolle.wert = 'bauleiter'
    expect((await post({ employee_id: 'e1', work_date: '2026-01-05', hours: 8 })).status).toBe(403)
  })
})

describe('Stempeln (Mitarbeiter): Eingaben werden geprüft', () => {
  beforeEach(() => { rolle.wert = 'disponent'; vi.stubGlobal('fetch', baueFakeRest(db)) })
  const post = async (body: object) => (await import('@/app/api/time-entries/route')).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }))
  const put = async (body: object) => (await import('@/app/api/time-entries/route')).PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }))
  it('manuelle Stunden außerhalb 0–24 werden abgewiesen (Büro)', async () => {
    expect((await post({ employee_id: 'e1', hours: -1 })).status).toBe(400)
    expect((await post({ employee_id: 'e1', hours: 30 })).status).toBe(400)
    expect(db.time_entries).toHaveLength(0)
  })
  it('Ausstempeln rechnet Netto mit Pause', async () => {
    db.time_entries.push({ id: 't1', employee_id: 'e1', start_time: '2026-01-05T07:00:00Z', end_time: null })
    const r = await put({ id: 't1', end_time: '2026-01-05T16:30:00Z' })
    expect(r.status).toBe(200)
    expect(db.time_entries[0]).toMatchObject({ hours: 8.75, break_minutes: 45 })
  })
  it('Korrektur mit negativer Pause wird abgewiesen', async () => {
    db.time_entries.push({ id: 't1', employee_id: 'e1', hours: 8 })
    expect((await put({ id: 't1', break_minutes: -30 })).status).toBe(400)
  })
})

describe('Monatsübersicht: mehr als 1000 Einträge', () => {
  it('Summen enthalten ALLE Einträge, nicht nur die ersten 1000', async () => {
    db.employees = Array.from({ length: 60 }, (_, i) => ({ id: `e${i}`, first_name: 'M', last_name: `N${i}` }))
    for (let e = 0; e < 60; e++) for (let d = 1; d <= 20; d++) db.time_entries.push({ id: `t-${e}-${d}`, employee_id: `e${e}`, work_date: `2026-03-${String(d).padStart(2, '0')}`, hours: 8, break_minutes: 30 })
    const fake = baueFakeRest(db)
    // Nachbau der Obergrenze der Datenbank (1000 Zeilen je Anfrage) inkl. offset
    vi.stubGlobal('fetch', async (eingabe: string, init?: RequestInit) => {
      const u = new URL(String(eingabe))
      const r = await fake(eingabe, init)
      if ((init?.method ?? 'GET') !== 'GET') return r
      const zeilen: unknown[] = await r.json()
      const offset = Number(u.searchParams.get('offset') || 0)
      const limit = Math.min(Number(u.searchParams.get('limit') || 1000), 1000)
      return new Response(JSON.stringify(zeilen.slice(offset, offset + limit)), { status: 200 })
    })
    const { GET } = await import('@/app/api/zeiterfassung/route')
    const j = await (await GET(new Request('http://x/api/zeiterfassung?month=2026-03') as never)).json()
    const gesamt = Object.values(j.summary as Record<string, { ist_hours: number }>).reduce((s, x) => s + x.ist_hours, 0)
    expect(gesamt).toBe(60 * 20 * 8)
    expect(Object.keys(j.summary)).toHaveLength(60)
  })
})

describe('Eigene Zeiten: nur Admin und Disposition dürfen ändern', () => {
  beforeEach(() => vi.stubGlobal('fetch', baueFakeRest(db)))
  const post = async (body: object) => (await import('@/app/api/time-entries/route')).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }))
  const put = async (body: object) => (await import('@/app/api/time-entries/route')).PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }))

  it.each(['mitarbeiter', 'lager', 'bauleiter'])('%s kann einstempeln', async (r) => {
    rolle.wert = r
    const res = await post({ employee_id: 'e1', note: 'Tour: A' })
    expect(res.status).toBe(200)
    expect(db.time_entries[0].start_time).toBeTruthy()
    expect(db.time_entries[0].hours).toBeUndefined()
  })
  it.each(['mitarbeiter', 'lager', 'bauleiter'])('%s kann KEINE Stunden, Pause oder Datum nachtragen', async (r) => {
    rolle.wert = r
    for (const extra of [{ hours: 8 }, { break_minutes: 0 }, { work_date: '2026-01-05' }]) {
      expect((await post({ employee_id: 'e1', ...extra })).status).toBe(403)
    }
    expect(db.time_entries).toHaveLength(0)
  })
  it('Mitarbeiter kann ausstempeln; die Endzeit setzt der Server (nicht der Browser)', async () => {
    rolle.wert = 'mitarbeiter'
    db.time_entries.push({ id: 't1', employee_id: 'e1', start_time: new Date(Date.now() - 2 * 3600000).toISOString(), end_time: null })
    const res = await put({ id: 't1', end_time: '2020-01-01T00:00:00Z' })
    expect(res.status).toBe(200)
    expect(new Date(String(db.time_entries[0].end_time)).getFullYear()).toBeGreaterThanOrEqual(2026)
    expect(db.time_entries[0].hours).toBeCloseTo(2, 1)
  })
  it('Mitarbeiter kann Start, Datum, Stunden, Pause oder Notiz NICHT ändern', async () => {
    rolle.wert = 'mitarbeiter'
    db.time_entries.push({ id: 't1', employee_id: 'e1', start_time: '2026-01-05T07:00:00Z', end_time: null, hours: null })
    for (const extra of [{ start_time: '2026-01-05T05:00:00Z' }, { work_date: '2026-01-01' }, { hours: 10 }, { break_minutes: 0 }, { note: 'x' }]) {
      expect((await put({ id: 't1', ...extra })).status).toBe(403)
    }
    expect(db.time_entries[0].hours).toBeNull()
  })
  it('Mitarbeiter kann einen schon abgeschlossenen Eintrag nicht mehr ausstempeln/ändern', async () => {
    rolle.wert = 'mitarbeiter'
    db.time_entries.push({ id: 't1', employee_id: 'e1', start_time: '2026-01-05T07:00:00Z', end_time: '2026-01-05T15:00:00Z', hours: 7.5 })
    expect((await put({ id: 't1', end_time: '2026-01-05T20:00:00Z' })).status).toBe(403)
    expect(db.time_entries[0].hours).toBe(7.5)
  })
  it('Disposition darf nachtragen und korrigieren', async () => {
    rolle.wert = 'disponent'
    expect((await post({ employee_id: 'e1', work_date: '2026-01-05', hours: 8 })).status).toBe(200)
    db.time_entries.push({ id: 't9', employee_id: 'e1', start_time: '2026-01-05T07:00:00Z', end_time: '2026-01-05T15:00:00Z', hours: 7.5 })
    expect((await put({ id: 't9', hours: 8 })).status).toBe(200)
  })
})
