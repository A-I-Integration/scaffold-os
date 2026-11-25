import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
let rolle = 'mitarbeiter'
let eigene: string | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: (_s: string, wert: string) => ({
      single: async () => ({ data: { role: rolle } }),
      eq: () => ({ maybeSingle: async () => ({ data: eigene === wert ? { id: wert } : null }) }),
    }) }) }),
  }),
}))

const E1 = '11111111-1111-4111-8111-111111111111'
const E2 = '22222222-2222-4222-8222-222222222222'
let db: Tabellen
beforeEach(() => {
  rolle = 'mitarbeiter'; eigene = E1
  db = { spesen_tage: [
    { employee_id: E1, work_date: '2026-11-10', einsatzart: 'auswaerts_voll', vorschlag_tarif: 24, vorschlag_steuer: 28, betrag_manuell: null },
    { employee_id: E1, work_date: '2026-11-11', einsatzart: 'heimfahrt', vorschlag_tarif: 3.5, vorschlag_steuer: 14, betrag_manuell: 5 },
    { employee_id: E1, work_date: '2026-10-31', einsatzart: 'heimfahrt', vorschlag_tarif: 3.5, vorschlag_steuer: 14, betrag_manuell: null },
  ] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const get = async (q: string) => (await import('@/app/api/spesen-monat/route')).GET(new Request('http://x/api/spesen-monat?' + q) as never)

describe('Route Spesen-Monat (Stundenzettel)', () => {
  it('Mitarbeiter sieht die eigenen Tagesbeträge des Monats, ohne Vergleichswerte', async () => {
    const j = await (await get(`monat=2026-11&employee_id=${E1}`)).json()
    expect(j.tage).toEqual([{ work_date: '2026-11-10', betrag: 24 }, { work_date: '2026-11-11', betrag: 5 }])
    expect(JSON.stringify(j)).not.toContain('vorschlag_steuer')
  })
  it('fremde Mitarbeiter bleiben gesperrt, Chef und Dispo dürfen', async () => {
    expect((await get(`monat=2026-11&employee_id=${E2}`)).status).toBe(403)
    rolle = 'disponent'; expect((await get(`monat=2026-11&employee_id=${E2}`)).status).toBe(200)
  })
  it('ungültige Eingaben, fehlende Tabelle', async () => {
    expect((await get(`monat=2026-13&employee_id=${E1}`)).status).toBe(400); expect((await get('monat=2026-11&employee_id=x')).status).toBe(400)
    const rest = baueFakeRest(db)
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('spesen_tage') ? new Response('relation "public.spesen_tage" does not exist', { status: 404 }) : rest(u, i))
    expect((await (await get(`monat=2026-11&employee_id=${E1}`)).json()).tage).toEqual([])
  })
})
