import { describe, it, expect, vi, beforeEach } from 'vitest'

const ctx = vi.hoisted(() => ({ role: 'lager' }))
vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server')
  return {
    pruefeRolle: async () => ({ ok: true, userId: 'u1', role: ctx.role }),
    serverErrorResponse: () => NextResponse.json({ success: false }, { status: 500 }),
  }
})
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'

import { POST } from '../buchen/route'

const A = '11111111-1111-4111-8111-111111111111'
const L1 = '22222222-2222-4222-8222-222222222222'
const L2 = '33333333-3333-4333-8333-333333333333'
const call = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)
const ul = (extra = {}) => ({ bewegungsart: 'UL', positionen: [{ inventory_id: A, menge: 5, von_lagerort: L1, nach_lagerort: L2 }], ...extra })

describe('Lager-Buchen-API', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    ctx.role = 'lager'
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => new Response(JSON.stringify('beleg-1'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('bucht eine Umlagerung über buche_lager und reicht den Nutzer durch', async () => {
    const r = await call(ul())
    expect(r.status).toBe(200)
    expect((await r.json()).beleg_id).toBe('beleg-1')
    const [u, init] = fetchMock.mock.calls[0]
    expect(u).toContain('/rpc/buche_lager')
    const b = JSON.parse(init.body)
    expect(b.p_bewegungsart).toBe('UL')
    expect(b.p_user).toBe('u1')
  })
  it('lehnt Anfangsbestand, Storno-Bewegungsart und Unbekanntes ab – ohne die DB zu fragen', async () => {
    for (const art of ['AB', 'ST', 'XX', '']) expect((await call(ul({ bewegungsart: art }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('prüft Mengen: nur ganze Zahlen über 0', async () => {
    for (const menge of [0, -1, 1.5, '3', null]) {
      const r = await call({ bewegungsart: 'UL', positionen: [{ inventory_id: A, menge, von_lagerort: L1, nach_lagerort: L2 }] })
      expect(r.status).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('prüft IDs, Zustände und leere Belege', async () => {
    expect((await call({ bewegungsart: 'UL', positionen: [] })).status).toBe(400)
    expect((await call({ bewegungsart: 'UL', positionen: [{ inventory_id: 'x', menge: 1 }] })).status).toBe(400)
    expect((await call(ul({ positionen: [{ inventory_id: A, menge: 1, von_lagerort: L1, nach_lagerort: L2, nach_zustand: 'kaputt' }] }))).status).toBe(400)
    expect((await call(ul({ project_id: 'nope' }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('Verlust, Inventurdifferenz und Storno nur Admin/Disposition', async () => {
    ctx.role = 'lager'
    const vl = { bewegungsart: 'VL', positionen: [{ inventory_id: A, menge: 1, von_lagerort: L1 }] }
    expect((await call(vl)).status).toBe(403)
    expect((await call({ storno_von: A })).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    ctx.role = 'disponent'
    expect((await call(vl)).status).toBe(200)
    expect((await call({ storno_von: A, grund: 'Irrtum' })).status).toBe(200)
    expect(fetchMock.mock.calls[1][0]).toContain('/rpc/storniere_lager')
  })
  it('gibt fachliche Datenbankfehler verständlich zurück (422), technische nicht', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Nicht genug Bestand: Artikel R1, Lagerort HAUPTLAGER, Zustand frei: vorhanden 3, benötigt 5.' }), { status: 400 }))
    const r = await call(ul())
    expect(r.status).toBe(422)
    expect((await r.json()).error).toContain('Nicht genug Bestand')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'relation "bestand" does not exist' }), { status: 400 }))
    expect((await call(ul())).status).toBe(500)
  })
})
