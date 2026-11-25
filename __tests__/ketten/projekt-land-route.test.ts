import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'mitarbeiter' } }) }) }) }),
  }),
}))
vi.mock('@/lib/angebot-annahme', () => ({ beiAngebotsannahmeSicher: async () => {} }))
vi.mock('@/lib/auto-tour', () => ({ fahrtNachholenSicher: async () => {} }))

const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let db: Tabellen
beforeEach(() => {
  db = { projects: [{ id: P1, name: 'T', adresse: 'x', status: 'active', aufmass_version: 0, data: {} }], project_versions: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

describe('Land der Baustelle beim Speichern des Aufmaßes', () => {
  it('POST übernimmt das Land aus Schritt 1', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const r = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ name: 'Neu', adresse: 'Rue 1', data: { step1: { land: 'Luxemburg' } } }) }) as never)
    expect(r.status).toBe(200)
    expect((db.projects.find((p) => p.name === 'Neu') as any).land).toBe('Luxemburg')
  })
  it('POST mit body.land hat Vorrang; leeres Land speichert keins', async () => {
    const { POST } = await import('@/app/api/projects/route')
    await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ name: 'A', land: 'Polen', data: { step1: { land: 'Luxemburg' } } }) }) as never)
    await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ name: 'B', data: { step1: { land: '' } } }) }) as never)
    expect((db.projects.find((p) => p.name === 'A') as any).land).toBe('Polen')
    expect((db.projects.find((p) => p.name === 'B') as any).land ?? null).toBeNull()
  })
  it('PATCH mit neuem Schritt 1 aktualisiert das Land der Baustelle', async () => {
    const { PATCH } = await import('@/app/api/projects/route')
    const r = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: P1, data: { step1: { land: 'Österreich' } } }) }) as never)
    expect(r.status).toBe(200)
    expect((db.projects[0] as any).land).toBe('Österreich')
  })
  it('ungültiges Land (Sonderzeichen) wird nicht gespeichert, Aufmaß wird trotzdem gesichert', async () => {
    const { PATCH } = await import('@/app/api/projects/route')
    await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: P1, data: { step1: { land: '<x>' } } }) }) as never)
    expect((db.projects[0] as any).land ?? null).toBeNull()
    expect((db.projects[0] as any).data.step1.land).toBe('<x>')
  })
})
