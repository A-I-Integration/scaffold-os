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
  db = { employees: [{ id: E1, first_name: 'Max', last_name: 'Muster', status: 'active' }], employee_personal: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const route = () => import('@/app/api/mitarbeiter-stamm/route')
const post = async (b: unknown) => (await route()).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never)
const get = async (q = '') => (await route()).GET(new Request('http://x/api/mitarbeiter-stamm' + q) as never)

describe('Route Personalstamm', () => {
  it('legt einen neuen Mitarbeiter mit Stammdaten an', async () => {
    const r = await post({ first_name: 'Anna', last_name: 'Beispiel', steuerklasse: '1', sv_nummer: '12010190A123', fuehrerschein_klassen: ['B', 'BE'], license_expires: '2030-05-01', weekly_hours: '40' })
    expect(r.status).toBe(200)
    expect(db.employees).toHaveLength(2)
    expect(db.employees[1]).toMatchObject({ first_name: 'Anna', fuehrerschein_klassen: ['B', 'BE'], license_expires: '2030-05-01', weekly_hours: 40, status: 'active' })
    expect(db.employee_personal[0]).toMatchObject({ steuerklasse: 1, sv_nummer: '12010190A123' })
  })
  it('ändert einen bestehenden Mitarbeiter und ersetzt die Stammdaten statt zu verdoppeln', async () => {
    await post({ employee_id: E1, first_name: 'Max', last_name: 'Muster', steuerklasse: '1' })
    await post({ employee_id: E1, first_name: 'Max', last_name: 'Mustermann', steuerklasse: '3' })
    expect(db.employees).toHaveLength(1)
    expect((db.employees[0] as any).last_name).toBe('Mustermann')
    expect(db.employee_personal).toHaveLength(1)
    expect((db.employee_personal[0] as any).steuerklasse).toBe(3)
    const j = await (await get('?employee_id=' + E1)).json()
    expect(j.personal.steuerklasse).toBe(3)
  })
  it('lehnt ungültige Eingaben ab, ohne etwas zu speichern', async () => {
    expect((await post({ first_name: '', last_name: 'X' })).status).toBe(400)
    expect((await post({ first_name: 'A', last_name: 'B', steuer_id: '12' })).status).toBe(400)
    expect((await post({ first_name: 'A', last_name: 'B', fuehrerschein_klassen: ['Z'] })).status).toBe(400)
    expect((await post({ first_name: 'A', last_name: 'B', license_expires: '2026-13-01' })).status).toBe(400)
    expect((await post({ first_name: 'A', last_name: 'B', weekly_hours: '99' })).status).toBe(400)
    expect((await post({ employee_id: '22222222-2222-4222-8222-222222222222', first_name: 'A', last_name: 'B' })).status).toBe(404)
    expect(db.employees).toHaveLength(1); expect(db.employee_personal).toHaveLength(0)
  })
  it('nur der Chef: alle anderen Rollen bekommen 403', async () => {
    for (const r of ['disponent', 'bauleiter', 'mitarbeiter', 'lager']) {
      rolle = r
      expect((await get()).status).toBe(403)
      expect((await get('?employee_id=' + E1)).status).toBe(403)
      expect((await post({ first_name: 'A', last_name: 'B' })).status).toBe(403)
    }
    expect(db.employees).toHaveLength(1)
  })
})
