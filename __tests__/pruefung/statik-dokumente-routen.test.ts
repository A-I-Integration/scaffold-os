import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextResponse } from 'next/server'

const h = vi.hoisted(() => ({ buero: true, statiker: true, userId: 'u-statiker', freigegeben: true, aktionen: [] as unknown[] }))
vi.mock('@/lib/auth', async () => {
  const echt = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...echt, pruefeRolle: async () => (h.buero ? { ok: true, userId: 'u-buero', role: 'admin' } : { ok: false, response: NextResponse.json({ success: false }, { status: 403 }) }) }
})
vi.mock('@/lib/statiker-auth', () => ({
  pruefeStatiker: async () => (h.statiker ? { ok: true, userId: h.userId } : { ok: false, response: NextResponse.json({ success: false }, { status: 403 }) }),
}))
vi.mock('@/lib/statik-dokumente-server', async () => {
  const echt = await vi.importActual<typeof import('@/lib/statik-dokumente-server')>('@/lib/statik-dokumente-server')
  return { ...echt, ladeDokumente: async () => ({ dokumente: [], status: null }), fuehreStatikAktionAus: async (k: unknown, a: unknown) => { h.aktionen.push({ k, a }); return {} } }
})

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
const P = '11111111-1111-4111-8111-111111111111'
const req = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never
const getReq = (q = '') => ({ nextUrl: new URL(`http://x/api${q}`) }) as never

beforeEach(() => {
  h.buero = true; h.statiker = true; h.freigegeben = true; h.aktionen = []
  vi.stubGlobal('fetch', vi.fn(async (u: RequestInfo | URL) => (String(u).includes('project_statiker') ? new Response(JSON.stringify(h.freigegeben ? [{ project_id: P }] : [])) : new Response('[]'))))
})

describe('Statik-Dokumente: Büro-Route', () => {
  it('ohne Berechtigung 403; mit Berechtigung Absender „buero“', async () => {
    const { GET, POST } = await import('@/app/api/statik-dokumente/route')
    h.buero = false
    expect((await GET(getReq(`?project_id=${P}`))).status).toBe(403)
    expect((await POST(req({ project_id: P, aktion: 'loeschen', id: P }))).status).toBe(403)
    h.buero = true
    expect((await GET(getReq(`?project_id=${P}`))).status).toBe(200)
    expect((await POST(req({ project_id: P, aktion: 'loeschen', id: P }))).status).toBe(200)
    expect(h.aktionen[0]).toMatchObject({ k: { absender: 'buero', projectId: P } })
  })
  it('ungültige Projekt-ID oder Aktion → 400', async () => {
    const { GET, POST } = await import('@/app/api/statik-dokumente/route')
    expect((await GET(getReq('?project_id=x'))).status).toBe(400)
    expect((await POST(req({ project_id: 'x', aktion: 'loeschen', id: P }))).status).toBe(400)
    expect((await POST(req({ project_id: P, aktion: 'nix' }))).status).toBe(400)
    expect(h.aktionen).toHaveLength(0)
  })
})

describe('Statik-Dokumente: Statiker-Route', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) })
  it('kein Statiker → 403; nicht freigegebenes oder ungültiges Projekt → 404 ohne Aktion', async () => {
    const { GET, POST } = await import('@/app/api/statiker/projekte/[id]/dokumente/route')
    h.statiker = false
    expect((await GET(getReq(), params(P))).status).toBe(403)
    h.statiker = true; h.freigegeben = false
    expect((await GET(getReq(), params(P))).status).toBe(404)
    expect((await POST(req({ aktion: 'loeschen', id: P }), params(P))).status).toBe(404)
    h.freigegeben = true
    expect((await GET(getReq(), params('kaputt'))).status).toBe(404)
    expect(h.aktionen).toHaveLength(0)
  })
  it('freigegebenes Projekt: Aktion läuft als Absender „statiker“ mit der echten Benutzer-ID', async () => {
    const { POST } = await import('@/app/api/statiker/projekte/[id]/dokumente/route')
    expect((await POST(req({ aktion: 'status', feld: 'bescheinigung', datum: '2026-11-10' }), params(P))).status).toBe(200)
    expect(h.aktionen[0]).toMatchObject({ k: { absender: 'statiker', userId: 'u-statiker', projectId: P } })
  })
})
