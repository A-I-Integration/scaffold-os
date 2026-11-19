import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// CAD-Projekte im Konto: Routen mit simuliertem Login und simulierter Datenbank (fetch gegen eine kleine In-Memory-REST-Nachbildung).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
let rolle: string | null = 'admin'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: rolle ? { id: 'u1' } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: rolle } }) }) }) }),
  }),
}))

type Zeile = Record<string, unknown>
let projekte: Zeile[] = []
let staende: Zeile[] = []
let n = 0
const f = (u: string, k: string) => new URL(u).searchParams.get(k)?.replace(/^(eq|lte)\./, '')
beforeEach(() => {
  rolle = 'admin'; projekte = []; staende = []; n = 0
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const u = String(input), m = init?.method ?? 'GET'
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 })
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (u.includes('/cad_projekt_staende')) {
      if (m === 'POST') { staende.push(body); return json([]) }
      if (m === 'DELETE') { const bis = Number(f(u, 'revision')); staende = staende.filter((s) => (s.revision as number) > bis); return json([]) }
      const rev = f(u, 'revision'); return json(staende.filter((s) => s.cad_projekt_id === f(u, 'cad_projekt_id') && (!rev || String(s.revision) === rev)).sort((a, b) => (b.revision as number) - (a.revision as number)))
    }
    if (m === 'POST') { const z = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, revision: 1, created_at: 't', updated_at: 't', ...body }; projekte.push(z); return json([z]) }
    const id = f(u, 'id'), rev = f(u, 'revision')
    const passt = (z: Zeile) => (!id || z.id === id) && (!rev || String(z.revision) === rev)
    if (m === 'PATCH') { const t = projekte.filter(passt); t.forEach((z) => Object.assign(z, body)); return json(t) }
    if (m === 'DELETE') { const t = projekte.filter(passt); projekte = projekte.filter((z) => !passt(z)); return json(t) }
    return json(projekte.filter(passt))
  }))
})

const gueltig = { format: 'scaffoldos-cad-projekt', version: 1, name: 'Haus A', systemId: 'layher-allround', building: { lengthM: 12, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [4, 4], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] }, statikDaten: {}, notizen: [] }

const liste = async () => (await import('@/app/api/cad/projekte/route'))
const einzel = async () => (await import('@/app/api/cad/projekte/[id]/route'))
const req = (url: string, method = 'GET', body?: unknown) => new NextRequest(`http://x${url}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describe('CAD-Projekte API', () => {
  it('ohne Login 401, mit falscher Rolle 403', async () => {
    rolle = null
    expect((await (await liste()).GET()).status).toBe(401)
    rolle = 'mitarbeiter'
    expect((await (await liste()).GET()).status).toBe(403)
  })
  it('anlegen, auflisten, laden, speichern mit Revision, Verlauf, älteren Stand laden, löschen', async () => {
    const a = await (await liste()).POST(req('/api/cad/projekte', 'POST', { name: 'Haus A', daten: gueltig }))
    expect(a.status).toBe(200)
    const p = (await a.json()).projekt as { id: string; revision: number }
    expect(p.revision).toBe(1)
    expect(((await (await (await liste()).GET()).json()).projekte as unknown[]).length).toBe(1)
    const g = await (await einzel()).GET(req(`/api/cad/projekte/${p.id}`), ctx(p.id))
    expect((await g.json()).projekt.daten.building.lengthM).toBe(12)
    const neu = { ...gueltig, building: { ...gueltig.building, lengthM: 15 } }
    const s = await (await einzel()).PUT(req(`/api/cad/projekte/${p.id}`, 'PUT', { name: 'Haus A v2', daten: neu, revision: 1 }), ctx(p.id))
    expect(s.status).toBe(200)
    expect((await s.json()).projekt.revision).toBe(2)
    const st = await (await (await einzel()).GET(req(`/api/cad/projekte/${p.id}?staende=1`), ctx(p.id))).json()
    expect(st.staende.map((x: { revision: number }) => x.revision)).toEqual([2, 1])
    const alt = await (await (await einzel()).GET(req(`/api/cad/projekte/${p.id}?revision=1`), ctx(p.id))).json()
    expect(alt.projekt.daten.building.lengthM).toBe(12)
    const d = await (await einzel()).DELETE(req(`/api/cad/projekte/${p.id}`, 'DELETE'), ctx(p.id))
    expect(d.status).toBe(200)
    expect((await (await einzel()).GET(req(`/api/cad/projekte/${p.id}`), ctx(p.id))).status).toBe(404)
  })
  it('veraltete Revision wird mit 409 abgelehnt und überschreibt nichts', async () => {
    const p = (await (await (await liste()).POST(req('/api/cad/projekte', 'POST', { daten: gueltig }))).json()).projekt as { id: string }
    await (await einzel()).PUT(req('/x', 'PUT', { daten: gueltig, revision: 1 }), ctx(p.id))
    const neu = { ...gueltig, building: { ...gueltig.building, lengthM: 99 } }
    const r = await (await einzel()).PUT(req('/x', 'PUT', { daten: neu, revision: 1 }), ctx(p.id))
    expect(r.status).toBe(409)
    expect((projekte[0].daten as typeof gueltig).building.lengthM).toBe(12)
  })
  it('ungültige Daten, ungültige IDs und fehlende Revision werden abgelehnt', async () => {
    expect((await (await liste()).POST(req('/api/cad/projekte', 'POST', { daten: { unsinn: 1 } }))).status).toBe(400)
    expect((await (await liste()).POST(req('/api/cad/projekte', 'POST', { daten: gueltig, project_id: 'kein-uuid' }))).status).toBe(400)
    expect((await (await einzel()).GET(req('/x'), ctx('kein-uuid'))).status).toBe(404)
    const p = (await (await (await liste()).POST(req('/api/cad/projekte', 'POST', { daten: gueltig }))).json()).projekt as { id: string }
    expect((await (await einzel()).PUT(req('/x', 'PUT', { daten: gueltig }), ctx(p.id))).status).toBe(400)
  })
  it('behält nur die letzten 20 Stände', async () => {
    const p = (await (await (await liste()).POST(req('/api/cad/projekte', 'POST', { daten: gueltig }))).json()).projekt as { id: string }
    for (let r = 1; r <= 22; r++) await (await einzel()).PUT(req('/x', 'PUT', { daten: gueltig, revision: r }), ctx(p.id))
    expect(staende.length).toBe(20)
    expect(Math.min(...staende.map((s) => s.revision as number))).toBe(4)
  })
})
