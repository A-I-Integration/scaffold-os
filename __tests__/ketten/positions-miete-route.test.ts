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

beforeEach(() => {
  db = { projects: [{ id: P1, name: 'Test', adresse: 'x', status: 'active', aufmass_version: 0, data: {} }], project_versions: [], abrechnung_historie: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

async function patch(data: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/projects/route')
  return PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: P1, data }) }) as never)
}

const miete = () => (db.projects[0] as any).data.positionsMiete

describe('Projekt-Route: Vorhalte-Regel je Position', () => {
  it('speichert gültige Regeln', async () => {
    expect((await patch({ positionsMiete: [{ key: 'a|m²|#01.01', modus: 'eigen', freiTage: 28 }, { key: 'b', modus: 'keine', verweisKey: 'a|m²|#01.01' }] })).status).toBe(200)
    expect(miete()).toEqual([{ key: 'a|m²|#01.01', modus: 'eigen', freiTage: 28 }, { key: 'b', modus: 'keine', verweisKey: 'a|m²|#01.01' }])
  })
  it('bereinigt ungültige Einträge serverseitig', async () => {
    expect((await patch({ positionsMiete: [{ key: 'a', modus: 'eigen', freiTage: -5 }, { key: 'a', modus: 'keine' }, { key: 'z', modus: 'unsinn' }, 'müll'] })).status).toBe(200)
    expect(miete()).toEqual([{ key: 'a', modus: 'eigen', freiTage: 0 }])
  })
  it('andere Projektdaten lassen die Regeln unberührt', async () => {
    await patch({ positionsMiete: [{ key: 'a', modus: 'eigen', freiTage: 7 }] })
    expect((await patch({ notiz: 'x' })).status).toBe(200)
    expect(miete()).toHaveLength(1)
  })
})
