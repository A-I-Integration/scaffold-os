import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }),
  }),
}))
vi.mock('@/lib/angebot-annahme', () => ({ beiAngebotsannahmeSicher: async () => {} }))
vi.mock('@/lib/auto-tour', () => ({ fahrtNachholenSicher: async () => {} }))

const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let db: Tabellen
const E1 = { id: 'e1', key: 'dach|m²', art: 'abmeldung', datum: '2026-12-05', erstelltAm: '2026-12-05T08:00:00Z' }
const E2 = { id: 'e2', key: 'dach|m²', art: 'abbau', datum: '2026-12-10', vollstaendig: true, nachweis: 'Protokoll 7', erstelltAm: '2026-12-10T08:00:00Z' }

beforeEach(() => {
  db = { projects: [{ id: P1, name: 'Test', adresse: 'x', status: 'active', aufmass_version: 0, data: { positionsEreignisse: [E1] } }], project_versions: [], abrechnung_historie: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

async function patch(data: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/projects/route')
  return PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: P1, data }) }) as never)
}
const gespeichert = () => (db.projects[0] as any).data.positionsEreignisse

describe('Projekt-Route: Abbauereignisse sind ein Verlauf (nur anfügen)', () => {
  it('neues Ereignis anfügen ist erlaubt', async () => {
    expect((await patch({ positionsEreignisse: [E1, E2] })).status).toBe(200)
    expect(gespeichert()).toHaveLength(2)
  })
  it('Löschen eines Ereignisses wird mit 409 abgelehnt', async () => {
    const r = await patch({ positionsEreignisse: [] })
    expect(r.status).toBe(409); expect((await r.json()).code).toBe('EREIGNISSE_GESPERRT')
    expect(gespeichert()).toHaveLength(1)
  })
  it('Ändern eines Ereignisses wird abgelehnt', async () => {
    expect((await patch({ positionsEreignisse: [{ ...E1, datum: '2026-12-06' }] })).status).toBe(409)
    expect(gespeichert()[0].datum).toBe('2026-12-05')
  })
  it('veralteter Stand eines Clients (kennt ein zwischenzeitliches Ereignis nicht) überschreibt es nicht', async () => {
    ;(db.projects[0] as any).data.positionsEreignisse = [E1, E2]
    expect((await patch({ positionsEreignisse: [E1, { ...E2, id: 'e3' }] })).status).toBe(409)
    expect(gespeichert().map((e: any) => e.id)).toEqual(['e1', 'e2'])
  })
  it('ungültige Einträge werden abgelehnt', async () => {
    expect((await patch({ positionsEreignisse: [E1, { id: 'x', key: 'dach|m²', art: 'unsinn', datum: '2026-12-01' }] })).status).toBe(409)
  })
  it('andere Projektdaten lassen sich weiter speichern, die Ereignisse bleiben unberührt', async () => {
    expect((await patch({ notiz: 'hallo' })).status).toBe(200)
    expect(gespeichert()).toHaveLength(1)
  })
})
