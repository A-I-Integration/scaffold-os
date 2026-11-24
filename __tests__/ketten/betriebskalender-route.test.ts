import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
let rolle = 'admin'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: (_s: string, w: string) => ({ single: async () => ({ data: { role: rolle } }), eq: () => ({ maybeSingle: async () => ({ data: w === E1 ? { id: E1 } : null }) }) }) }) }),
  }),
}))

const E1 = '11111111-1111-4111-8111-111111111111'
let db: Tabellen
beforeEach(() => {
  rolle = 'admin'
  db = { betriebskalender: [], employees: [{ id: E1, first_name: 'Max', last_name: 'Muster', status: 'active' }], employee_personal: [{ employee_id: E1, eintrittsdatum: '2026-01-01' }], employee_urlaubsanspruch: [{ employee_id: E1, tage_pro_jahr: 30, gueltig_ab: '2026-01-01' }], absences: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const route = () => import('@/app/api/betriebskalender/route')
const post = async (b: unknown) => (await route()).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never)
const get = async () => (await route()).GET()

describe('Route Betriebskalender', () => {
  it('Chef legt Betriebsferien an und löscht sie wieder', async () => {
    expect((await post({ art: 'betriebsferien', bezeichnung: 'Sommer', von: '2026-08-03', bis: '2026-08-14' })).status).toBe(200)
    expect(db.betriebskalender).toHaveLength(1)
    const id = '66666666-6666-4666-8666-666666666666'
    ;(db.betriebskalender[0] as any).id = id
    const j = await (await get()).json()
    expect(j.eintraege[0]).toMatchObject({ art: 'betriebsferien', bezeichnung: 'Sommer' })
    expect((await (await route()).DELETE(new Request('http://x/d?id=' + id, { method: 'DELETE' }) as never)).status).toBe(200)
    expect(db.betriebskalender).toHaveLength(0)
  })
  it('lehnt Ungültiges ab; Dispo darf lesen, aber nicht ändern; andere gar nicht', async () => {
    expect((await post({ art: 'betriebsferien', bezeichnung: '', von: '2026-08-03', bis: '2026-08-14' })).status).toBe(400)
    rolle = 'disponent'
    expect((await get()).status).toBe(200)
    expect((await post({ art: 'feiertag', bezeichnung: 'x', von: '2026-12-24' })).status).toBe(403)
    expect((await (await route()).DELETE(new Request('http://x/d?id=66666666-6666-4666-8666-666666666666', { method: 'DELETE' }) as never)).status).toBe(403)
    for (const r of ['bauleiter', 'mitarbeiter', 'lager']) { rolle = r; expect((await get()).status).toBe(403) }
    expect(db.betriebskalender).toHaveLength(0)
  })
  it('wirkt im Urlaubskonto des Mitarbeiters: Betriebsferien fest abgezogen', async () => {
    await post({ art: 'betriebsferien', bezeichnung: 'Sommer', von: '2026-08-03', bis: '2026-08-14' })
    rolle = 'admin'
    const k = await import('@/app/api/urlaubskonto/route')
    const j = await (await k.GET(new Request('http://x/api/urlaubskonto?employee_id=' + E1) as never)).json()
    expect(j.konto.betriebsferien).toBe(10)
  })
  it('das Urlaubskonto läuft weiter, wenn die Kalender-Tabelle noch fehlt', async () => {
    const rest = baueFakeRest(db)
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('betriebskalender') ? new Response('relation does not exist', { status: 404 }) : rest(u, i))
    const k = await import('@/app/api/urlaubskonto/route')
    const r = await k.GET(new Request('http://x/api/urlaubskonto?employee_id=' + E1) as never)
    expect(r.status).toBe(200)
    expect((await r.json()).konto.betriebsferien).toBe(0)
  })
})
