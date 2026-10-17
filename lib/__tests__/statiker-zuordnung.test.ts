import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Freigaben verwalten: nur Büro-Rollen; nur echte Statiker; nur CAD-Projekte.
let rolle: string | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: rolle ? { id: 'buero-1' } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: rolle ? { role: rolle } : null }) }) }) }),
  }),
}))

const PROJEKT = '11111111-1111-4111-8111-111111111111'
const STATIKER = '33333333-3333-4333-8333-333333333333'
const cad = { kiResult: { building: { lengthM: 10, widthM: 8, heightM: 9 }, systemId: 'layher-allround' } }

let istStatikerProfil = true
let projektDaten: unknown = cad
let schreibaufrufe: { methode: string; url: string; body?: string }[] = []

beforeEach(() => {
  rolle = 'admin'
  istStatikerProfil = true
  projektDaten = cad
  schreibaufrufe = []
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const u = String(input)
    const m = init?.method || 'GET'
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 })
    if (m !== 'GET') { schreibaufrufe.push({ methode: m, url: u, body: init?.body as string | undefined }); return json([{ ok: 1 }]) }
    if (u.includes('/profiles?id=eq.')) return json(istStatikerProfil ? [{ id: STATIKER }] : [])
    if (u.includes('/profiles?role=eq.statiker')) return json([{ id: STATIKER, full_name: 'Dr. Bauer', email: 'b@statik.de' }])
    if (u.includes('/projects?')) return json(projektDaten ? [{ data: projektDaten }] : [])
    if (u.includes('/project_statiker')) return json([])
    return json([])
  }))
})

const post = async (body: unknown) => {
  const { POST } = await import('../../app/api/statiker-zuordnung/route')
  return POST(new NextRequest('https://beispiel.test/api/statiker-zuordnung', { method: 'POST', body: JSON.stringify(body) }))
}

describe('Statiker-Freigabe vergeben', () => {
  it('Büro-Rollen dürfen freigeben (admin, disponent, bauleiter)', async () => {
    for (const r of ['admin', 'disponent', 'bauleiter']) {
      rolle = r; schreibaufrufe = []
      const res = await post({ project_id: PROJEKT, user_id: STATIKER })
      expect(res.status, r).toBe(200)
      expect(schreibaufrufe).toHaveLength(1)
      expect(JSON.parse(schreibaufrufe[0].body!)).toMatchObject({ project_id: PROJEKT, user_id: STATIKER })
    }
  })

  it('Mitarbeiter, Lager und nicht Eingeloggte dürfen nicht freigeben', async () => {
    for (const r of ['mitarbeiter', 'lager', 'statiker', null]) {
      rolle = r
      const res = await post({ project_id: PROJEKT, user_id: STATIKER })
      expect(res.status, String(r)).toBe(403)
    }
    expect(schreibaufrufe).toHaveLength(0)
  })

  it('Freigabe an einen Login, der kein Statiker ist → 422, nichts gespeichert', async () => {
    istStatikerProfil = false
    expect((await post({ project_id: PROJEKT, user_id: STATIKER })).status).toBe(422)
    expect(schreibaufrufe).toHaveLength(0)
  })

  it('Projekt ohne CAD-Planung → 422, nichts gespeichert', async () => {
    projektDaten = { aufmass: true }
    expect((await post({ project_id: PROJEKT, user_id: STATIKER })).status).toBe(422)
    expect(schreibaufrufe).toHaveLength(0)
  })

  it('ungültige IDs → 400', async () => {
    expect((await post({ project_id: 'abc', user_id: STATIKER })).status).toBe(400)
    expect((await post({ project_id: PROJEKT, user_id: "x' or 1=1" })).status).toBe(400)
    expect(schreibaufrufe).toHaveLength(0)
  })
})
