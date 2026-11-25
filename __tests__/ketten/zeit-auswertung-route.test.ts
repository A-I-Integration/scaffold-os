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
const P1 = '22222222-2222-4222-8222-222222222222'
let db: Tabellen
beforeEach(() => {
  rolle = 'admin'
  db = {
    employees: [{ id: E1, first_name: 'Max', last_name: 'Muster', status: 'active', weekly_hours: 40 }],
    projects: [{ id: P1, name: 'Wien', adresse: 'Ring 1', land: null }],
    time_entries: [
      { id: 't1', employee_id: E1, work_date: '2026-03-10', hours: 9, break_minutes: 30 },
      { id: 't2', employee_id: E1, work_date: '2026-11-10', hours: 8, break_minutes: 30 },
      { id: 't3', employee_id: E1, work_date: '2025-12-31', hours: 7, break_minutes: 0 },
    ],
  }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

describe('Zeiterfassung Jahr', () => {
  it('year liefert das ganze Jahr, month weiter den Monat', async () => {
    const { GET } = await import('@/app/api/zeiterfassung/route')
    const j = await (await GET(new Request('http://x/api/zeiterfassung?year=2026') as never)).json()
    expect(j.entriesByEmployee[E1]).toHaveLength(2)
    const m = await (await GET(new Request('http://x/api/zeiterfassung?month=2026-11') as never)).json()
    expect(m.entriesByEmployee[E1]).toHaveLength(1)
  })
  it('lehnt ungültiges Jahr und fehlenden Zeitraum ab', async () => {
    const { GET } = await import('@/app/api/zeiterfassung/route')
    expect((await GET(new Request('http://x/api/zeiterfassung?year=26') as never)).status).toBe(400)
    expect((await GET(new Request('http://x/api/zeiterfassung') as never)).status).toBe(400)
  })
})

describe('Route Land der Baustelle', () => {
  const route = () => import('@/app/api/projekt-land/route')
  const patch = async (b: unknown) => (await route()).PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(b) }) as never)
  it('Dispo setzt das Land, leer löscht es', async () => {
    rolle = 'disponent'
    expect((await patch({ project_id: P1, land: ' Österreich ' })).status).toBe(200)
    expect((db.projects[0] as any).land).toBe('Österreich')
    expect((await patch({ project_id: P1, land: '' })).status).toBe(200)
    expect((db.projects[0] as any).land).toBeNull()
  })
  it('lehnt Ungültiges ab; Bauleiter darf lesen, nicht schreiben', async () => {
    expect((await patch({ project_id: 'x', land: 'AT' })).status).toBe(400)
    expect((await patch({ project_id: P1, land: '<x>' })).status).toBe(400)
    rolle = 'bauleiter'
    expect((await patch({ project_id: P1, land: 'AT' })).status).toBe(403)
    const j = await (await (await route()).GET()).json()
    expect(j.projekte).toHaveLength(1)
    rolle = 'mitarbeiter'
    expect((await (await route()).GET()).status).toBe(403)
  })
})
