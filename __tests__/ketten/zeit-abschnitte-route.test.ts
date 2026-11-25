import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
let rolle = 'admin'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: rolle } }) }) }) }),
  }),
}))

const E1 = '11111111-1111-4111-8111-111111111111'
const t = (h: string) => `2026-11-10T${h}:00+01:00`
let db: Tabellen
beforeEach(() => {
  rolle = 'admin'
  db = { zeit_abschnitte: [], employees: [{ id: E1, first_name: 'Max', last_name: 'Muster', status: 'active' }],
    time_entries: [{ id: 'z1', employee_id: E1, work_date: '2026-11-10', start_time: t('06:30'), end_time: t('15:30'), hours: 8.25, break_minutes: 45 }] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const route = () => import('@/app/api/zeit-abschnitte/route')
const post = async (b: unknown) => (await route()).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never)
const patch = async (b: unknown) => (await route()).PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(b) }) as never)
const get = async (d = '2026-11-10') => (await route()).GET(new Request('http://x/api/zeit-abschnitte?datum=' + d) as never)
const abs = { employee_id: E1, work_date: '2026-11-10', art: 'baustelle', start_time: t('07:15'), end_time: t('12:00') }

describe('Route Tagesabschnitte', () => {
  it('Dispo trägt ein, ändert und löscht; Tag wird mit Stempelzeit geliefert', async () => {
    rolle = 'disponent'
    expect((await post(abs)).status).toBe(200)
    expect(db.zeit_abschnitte).toHaveLength(1)
    const id = '77777777-7777-4777-8777-777777777777'
    ;(db.zeit_abschnitte[0] as any).id = id
    const j = await (await get()).json()
    expect(j.entries).toHaveLength(1); expect(j.abschnitte).toHaveLength(1)
    expect((await patch({ ...abs, id, end_time: t('12:30') })).status).toBe(200)
    expect((db.zeit_abschnitte[0] as any).end_time).toContain('11:30')
    expect((await (await route()).DELETE(new Request('http://x/d?id=' + id, { method: 'DELETE' }) as never)).status).toBe(200)
    expect(db.zeit_abschnitte).toHaveLength(0)
  })
  it('lehnt Überschneidung und Ungültiges ab', async () => {
    await post(abs)
    expect((await post({ ...abs, start_time: t('11:00'), end_time: t('13:00') })).status).toBe(400)
    expect((await post({ ...abs, art: 'urlaub' })).status).toBe(400)
    expect(db.zeit_abschnitte).toHaveLength(1)
  })
  it('Bauleiter darf lesen, aber nicht schreiben; Mitarbeiter gar nichts', async () => {
    rolle = 'bauleiter'
    expect((await get()).status).toBe(200)
    expect((await post(abs)).status).toBe(403)
    rolle = 'mitarbeiter'
    expect((await get()).status).toBe(403)
    expect(db.zeit_abschnitte).toHaveLength(0)
  })
  it('liefert Mitarbeiter aus Touren des Tages, auch ohne Stempel', async () => {
    const E2 = '22222222-2222-4222-8222-222222222222', E3 = '33333333-3333-4333-8333-333333333333'
    db.tours = [{ id: 't1', planned_date: '2026-11-10', driver_id: E1, team_ids: [E1, E2] }, { id: 't2', planned_date: '2026-11-11', driver_id: E3, team_ids: [E3] }]
    const j = await (await get()).json()
    expect([...j.tourMitarbeiter].sort()).toEqual([E1, E2].sort())
  })
  it('Tagesansicht läuft weiter, wenn die Tabelle noch fehlt', async () => {
    const rest = baueFakeRest(db)
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('zeit_abschnitte') ? new Response('relation does not exist', { status: 404 }) : rest(u, i))
    const j = await (await get()).json()
    expect(j.tabelleFehlt).toBe(true); expect(j.entries).toHaveLength(1)
  })
})
