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
const pos = (menge: number) => [{ key: 'a|m²', bezeichnung: 'A', einheit: 'm²', einzelpreis: 10, menge }]
const ABGER = { id: 'za1', nr: 1, stichtag: '2026-03-01', flaecheM2: 100, notiz: '', erstelltAm: '', positionen: pos(100), rechnungId: 'r1', rechnungNr: 'RE-1', abgerechnetAm: '2026-03-02' }

beforeEach(() => {
  db = { projects: [{ id: P1, name: 'Test', adresse: 'x', status: 'active', aufmass_version: 0, data: { zwischenaufmasse: [JSON.parse(JSON.stringify(ABGER))] } }], project_versions: [], abrechnung_historie: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

async function patch(data: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/projects/route')
  return PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: P1, data }) }) as never)
}

describe('Projekt-Route schützt abgerechnete Zwischenaufmaße', () => {
  it('Löschen eines abgerechneten Aufmaßes wird mit 409 abgelehnt und nichts geändert', async () => {
    const r = await patch({ zwischenaufmasse: [] })
    expect(r.status).toBe(409)
    expect((await r.json()).code).toBe('AUFMASS_GESPERRT')
    expect((db.projects[0] as any).data.zwischenaufmasse).toHaveLength(1)
  })
  it('Ändern einer abgerechneten Menge wird abgelehnt', async () => {
    const z = JSON.parse(JSON.stringify(ABGER)); z.positionen[0].menge = 10; z.flaecheM2 = 10
    expect((await patch({ zwischenaufmasse: [z] })).status).toBe(409)
    expect((db.projects[0] as any).data.zwischenaufmasse[0].positionen[0].menge).toBe(100)
  })
  it('Korrektur als neues Aufmaß mit Begründung ist erlaubt und steht im Verlauf (von → auf)', async () => {
    const neu = { id: 'za2', nr: 2, stichtag: '2026-04-01', flaecheM2: 60, notiz: 'Rückbau Ost', erstelltAm: '', positionen: pos(60) }
    const r = await patch({ zwischenaufmasse: [ABGER, neu] })
    expect(r.status).toBe(200)
    const h = db.abrechnung_historie.find((x: any) => x.aktion === 'aufmass_erfasst') as any
    expect(h).toMatchObject({ user_id: 'u1', grund: 'Rückbau Ost' })
    expect(h.details.positionen[0]).toMatchObject({ von: 100, auf: 60 })
  })
  it('Andere Projektdaten lassen sich weiter speichern, das abgerechnete Aufmaß bleibt unberührt', async () => {
    expect((await patch({ notiz: 'hallo' })).status).toBe(200)
    expect((db.projects[0] as any).data.zwischenaufmasse[0].rechnungId).toBe('r1')
  })
  it('Veraltete Version (parallel geänderter Auftrag): Speichern wird mit 409 abgelehnt statt zu überschreiben', async () => {
    const orig = globalThis.fetch
    let gelesen = false
    vi.stubGlobal('fetch', async (u: any, i?: any) => {
      const res = await orig(u, i)
      if (!gelesen && String(u).includes('select=data,name,adresse,status,aufmass_version')) { gelesen = true; (db.projects[0] as any).aufmass_version = 1 }
      return res
    })
    const r = await patch({ notiz: 'hallo' })
    expect(r.status).toBe(409)
    expect((await r.json()).code).toBe('PROJEKT_GEAENDERT')
  })
})
