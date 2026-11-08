import { describe, it, expect, vi, beforeEach } from 'vitest'

const ctx = vi.hoisted(() => ({ role: 'disponent' }))
vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server')
  return {
    pruefeRolle: async () => ({ ok: true, userId: 'u1', role: ctx.role }),
    serverErrorResponse: () => NextResponse.json({ success: false }, { status: 500 }),
  }
})
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'

import { POST } from '../freigabe/route'

const ID = '11111111-1111-4111-8111-111111111111'
const call = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)

describe('Freigabe-API', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ id: ID }]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('Disposition darf prüfen, aber nicht freigeben', async () => {
    ctx.role = 'disponent'
    expect((await call({ artikel_id: ID, aktion: 'geprueft' })).status).toBe(200)
    const r = await call({ artikel_id: ID, aktion: 'freigeben' })
    expect(r.status).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(1) // nur die Prüfung, keine Freigabe geschrieben
  })
  it('Disposition darf die Freigabe auch nicht entziehen', async () => {
    ctx.role = 'disponent'
    expect((await call({ artikel_id: ID, aktion: 'freigabe_entziehen' })).status).toBe(403)
  })
  it('Admin gibt frei und wird als Freigebender eingetragen', async () => {
    ctx.role = 'admin'
    expect((await call({ artikel_id: ID, aktion: 'freigeben' })).status).toBe(200)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ freigabestatus: 'freigegeben', freigegeben_von: 'u1' })
  })
  it('ungültige Gewichtsart und unbekannte Aktion werden abgelehnt', async () => {
    ctx.role = 'admin'
    expect((await call({ artikel_id: ID, aktion: 'geprueft', gewichtsart: 'blau' })).status).toBe(400)
    expect((await call({ artikel_id: ID, aktion: 'x' })).status).toBe(400)
    expect((await call({ artikel_id: 'kaputt', aktion: 'geprueft' })).status).toBe(400)
  })
  it('Datenbank-Schutzmeldung wird weitergegeben', async () => {
    ctx.role = 'admin'
    fetchMock.mockResolvedValueOnce(new Response('{"message":"Bitte zuerst die Gewichtsart klären (ca., nenn)."}', { status: 400 }))
    const r = await call({ artikel_id: ID, aktion: 'freigeben' })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/Gewichtsart klären/)
  })
})
