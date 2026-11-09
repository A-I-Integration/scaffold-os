import { describe, it, expect, vi, beforeEach } from 'vitest'

const ctx = vi.hoisted(() => ({ role: 'disponent' }))
vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server')
  return {
    pruefeRolle: async (erlaubt: readonly string[]) => erlaubt.includes(ctx.role)
      ? { ok: true, userId: 'u1', role: ctx.role }
      : { ok: false, response: NextResponse.json({ success: false }, { status: 403 }) },
    serverErrorResponse: () => NextResponse.json({ success: false }, { status: 500 }),
  }
})
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'

import { POST } from '../orte/route'
import { GET } from '../belege/route'

const P = '44444444-4444-4444-8444-444444444444'
const A = '11111111-1111-4111-8111-111111111111'
const post = (b: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never)
const get = (qs: string) => GET(new Request('http://x/api/lager/belege' + qs) as never)

describe('Lagerorte anlegen', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    ctx.role = 'disponent'
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (u: string, init?: RequestInit) =>
      init?.method === 'POST' ? new Response(JSON.stringify([{ id: 'neu' }]), { status: 201 })
        : new Response(JSON.stringify([{ typ: 'standort' }]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('Lager-Rolle darf keine Orte anlegen', async () => {
    ctx.role = 'lager'
    expect((await post({ typ: 'standort', name: 'Werk 2' })).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('legt Standort an und bildet den Schlüssel aus dem Namen (Umlaute)', async () => {
    expect((await post({ typ: 'standort', name: 'Lager Köln-Süd' })).status).toBe(200)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.schluessel).toBe('STO-LAGER-KOELN-SUED')
  })
  it('Baustelle und Unbekanntes sind nicht anlegbar', async () => {
    for (const typ of ['baustelle', 'xx', '']) expect((await post({ typ, name: 'Test' })).status).toBe(400)
  })
  it('Regalplatz braucht einen passenden Ort darüber', async () => {
    expect((await post({ typ: 'lagerplatz', name: 'Regal A1' })).status).toBe(400)
    expect((await post({ typ: 'lagerplatz', name: 'Regal A1', parent_id: 'x' })).status).toBe(400)
    expect((await post({ typ: 'lagerplatz', name: 'Regal A1', parent_id: P })).status).toBe(200) // Eltern = Standort
  })
  it('Standort darf keinen übergeordneten Ort haben, LKW nur mit Fahrzeug-Typ', async () => {
    expect((await post({ typ: 'standort', name: 'Werk', parent_id: P })).status).toBe(400)
    expect((await post({ typ: 'standort', name: 'Werk', fahrzeug_id: P })).status).toBe(400)
  })
  it('doppelter Ort wird verständlich abgelehnt', async () => {
    fetchMock.mockImplementation(async (u: string, init?: RequestInit) => init?.method === 'POST' ? new Response('dup', { status: 409 }) : new Response('[]'))
    const r = await post({ typ: 'fahrzeug', name: 'LKW 1' })
    expect(r.status).toBe(409)
  })
})

describe('Belegliste', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    ctx.role = 'lager'
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (u: string) => new Response(JSON.stringify(u.includes('materialbeleg_positionen?') ? [{ beleg_id: 'b1' }, { beleg_id: 'b1' }, { beleg_id: 'b2' }] : []), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  it('lehnt ungültige Filter ab ohne Datenbankzugriff', async () => {
    expect((await get('?artikel=1;drop')).status).toBe(400)
    expect((await get('?projekt=x')).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('filtert nach Artikel über die Positionen (ohne doppelte Belege) und begrenzt die Anzahl', async () => {
    expect((await get(`?artikel=${A}&limit=9999`)).status).toBe(200)
    const url2 = fetchMock.mock.calls[1][0] as string
    expect(url2).toContain('id=in.(b1,b2)')
    expect(url2).toContain('limit=200')
  })
  it('Artikel ohne Belege liefert leere Liste', async () => {
    fetchMock.mockImplementation(async () => new Response('[]'))
    const r = await get(`?artikel=${A}`)
    expect((await r.json()).belege).toEqual([])
  })
})
