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
const E2 = '22222222-2222-4222-8222-222222222222'
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let db: Tabellen
beforeEach(() => {
  rolle = 'admin'
  db = {
    employees: [{ id: E1, first_name: 'Max', last_name: 'Muster' }, { id: E2, first_name: 'Eva', last_name: 'Ohnelohn' }],
    projects: [{ id: P1, name: 'Haus Müller' }],
    employee_wages: [{ employee_id: E1, stundenlohn: 20, gueltig_ab: '2026-01-01' }],
    time_entries: [
      { id: 't1', employee_id: E1, project_id: P1, work_date: '2026-11-10', hours: 8 },
      { id: 't2', employee_id: E2, project_id: P1, work_date: '2026-11-10', hours: 6 },
      { id: 't3', employee_id: E1, project_id: P1, work_date: '2026-10-31', hours: 8 },
    ],
  }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const get = async (q: string) => (await import('@/app/api/lohnkosten/route')).GET(new Request('http://x/api/lohnkosten' + q) as never)

describe('Route Lohnkosten', () => {
  it('rechnet den Monat je Baustelle und weist Stunden ohne Lohn getrennt aus', async () => {
    const j = await (await get('?monat=2026-11')).json()
    expect(j.baustellen).toHaveLength(1)
    expect(j.baustellen[0]).toMatchObject({ name: 'Haus Müller', stunden: 8, kosten: 160 })
    expect(j.baustellen[0].mitarbeiter[0].name).toBe('Max Muster')
    expect(j.ohneLohn).toMatchObject({ stunden: 6, mitarbeiter: [{ name: 'Eva Ohnelohn', stunden: 6 }] })
    expect(j.summe).toEqual({ stunden: 14, kosten: 160 })
  })
  it('ungültiger Monat wird abgelehnt', async () => {
    expect((await get('?monat=2026-13')).status).toBe(400)
    expect((await get('')).status).toBe(400)
  })
  it('nur der Chef sieht Lohnkosten', async () => {
    for (const r of ['disponent', 'bauleiter', 'mitarbeiter', 'lager']) { rolle = r; expect((await get('?monat=2026-11')).status).toBe(403) }
  })
})
