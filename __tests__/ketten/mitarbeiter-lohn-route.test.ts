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
let db: Tabellen
beforeEach(() => {
  rolle = 'admin'
  db = { employees: [{ id: E1 }], employee_wages: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const route = () => import('@/app/api/mitarbeiter-lohn/route')
const post = async (b: unknown) => (await route()).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never)
const get = async (q: string) => (await route()).GET(new Request('http://x/api/mitarbeiter-lohn' + q) as never)

describe('Route Stundenlohn', () => {
  it('speichert einen Lohn und liefert den Verlauf neueste zuerst', async () => {
    expect((await post({ employee_id: E1, stundenlohn: '17,50', gueltig_ab: '2026-01-01' })).status).toBe(200)
    expect((await post({ employee_id: E1, stundenlohn: '19', gueltig_ab: '2026-11-01', notiz: 'Beförderung' })).status).toBe(200)
    const j = await (await get('?employee_id=' + E1)).json()
    expect(j.loehne.map((l: any) => [l.stundenlohn, l.gueltig_ab])).toEqual([[19, '2026-11-01'], [17.5, '2026-01-01']])
  })
  it('derselbe Tag ersetzt den Eintrag statt zu verdoppeln', async () => {
    await post({ employee_id: E1, stundenlohn: '17', gueltig_ab: '2026-01-01' })
    await post({ employee_id: E1, stundenlohn: '18', gueltig_ab: '2026-01-01' })
    expect(db.employee_wages).toHaveLength(1)
    expect((db.employee_wages[0] as any).stundenlohn).toBe(18)
  })
  it('lehnt ungültige Eingaben und unbekannte Mitarbeiter ab', async () => {
    expect((await post({ employee_id: E1, stundenlohn: 'abc', gueltig_ab: '2026-01-01' })).status).toBe(400)
    expect((await post({ employee_id: E1, stundenlohn: '18', gueltig_ab: '' })).status).toBe(400)
    expect((await post({ employee_id: 'kaputt', stundenlohn: '18', gueltig_ab: '2026-01-01' })).status).toBe(400)
    expect((await post({ employee_id: '22222222-2222-4222-8222-222222222222', stundenlohn: '18', gueltig_ab: '2026-01-01' })).status).toBe(404)
    expect(db.employee_wages).toHaveLength(0)
  })
  it('nur der Chef: Disposition, Bauleitung und Mitarbeiter bekommen 403 und sehen nichts', async () => {
    await post({ employee_id: E1, stundenlohn: '17', gueltig_ab: '2026-01-01' })
    for (const r of ['disponent', 'bauleiter', 'mitarbeiter', 'lager']) {
      rolle = r
      expect((await get('?employee_id=' + E1)).status).toBe(403)
      expect((await post({ employee_id: E1, stundenlohn: '99', gueltig_ab: '2026-02-01' })).status).toBe(403)
    }
    expect(db.employee_wages).toHaveLength(1)
  })
  it('löscht einen Eintrag (nur Chef)', async () => {
    const id = '33333333-3333-4333-8333-333333333333'
    db.employee_wages.push({ id, employee_id: E1, stundenlohn: 17, gueltig_ab: '2026-01-01' })
    const del = async () => (await route()).DELETE(new Request('http://x/api/mitarbeiter-lohn?id=' + id, { method: 'DELETE' }) as never)
    rolle = 'disponent'
    expect((await del()).status).toBe(403)
    expect(db.employee_wages).toHaveLength(1)
    rolle = 'admin'
    expect((await del()).status).toBe(200)
    expect(db.employee_wages).toHaveLength(0)
  })
})
