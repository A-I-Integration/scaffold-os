import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({ rolle: 'admin', aufrufe: [] as unknown[] }))
vi.mock('@/lib/auth', async () => {
  const echt = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return { ...echt, pruefeRolle: async () => ({ ok: true, userId: 'u', role: h.rolle }) }
})
vi.mock('@/lib/nachtraege-aendern', async () => {
  const echt = await vi.importActual<typeof import('@/lib/nachtraege-aendern')>('@/lib/nachtraege-aendern')
  return { ...echt, aendereNachtraege: async (_p: string, op: unknown) => { h.aufrufe.push(op); return [] } }
})

const P = '11111111-1111-4111-8111-111111111111'
const anlegen = { op: 'anlegen', id: '00000000-0000-4000-8000-000000000001', datum: '2026-11-01', titel: 'T', grund: 'G', betrag: 0, fotos: [], vorOrt: true }
const post = async (aenderung: unknown) => (await import('@/app/api/nachtraege/route')).POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ project_id: P, aenderung }) }) as never)

beforeEach(() => { h.aufrufe = [] })

describe('Nachträge-Route: Rechte', () => {
  it.each(['admin', 'disponent', 'bauleiter'])('%s darf alles ändern', async (rolle) => {
    h.rolle = rolle
    expect((await post({ op: 'status', id: 'a', status: 'bestaetigt' })).status).toBe(200)
    expect((await post({ ...anlegen, betrag: 50, vorOrt: false })).status).toBe(200)
  })
  it.each(['mitarbeiter', 'lager'])('%s darf nur eine Meldung von der Baustelle ohne Betrag anlegen', async (rolle) => {
    h.rolle = rolle
    expect((await post(anlegen)).status).toBe(200)
    expect((await post({ ...anlegen, betrag: 50 })).status).toBe(403)
    expect((await post({ ...anlegen, vorOrt: false })).status).toBe(403)
    expect((await post({ ...anlegen, art: 'regie', regie: [] })).status).toBe(403)
    expect((await post({ op: 'status', id: 'a', status: 'bestaetigt' })).status).toBe(403)
    expect((await post({ op: 'loeschen', id: 'a' })).status).toBe(403)
    expect((await post({ op: 'betrag', id: 'a', betrag: 5 })).status).toBe(403)
    expect(h.aufrufe).toHaveLength(1)
  })
  it('ungültige Eingabe → 400', async () => {
    h.rolle = 'admin'
    expect((await post({ op: 'status', id: 'a', status: 'quatsch' })).status).toBe(400)
  })
})
