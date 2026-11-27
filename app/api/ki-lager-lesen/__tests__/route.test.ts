import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server')
  return { pruefeRolle: async () => ({ ok: true, userId: 'u1', role: 'admin' }), serverErrorResponse: () => NextResponse.json({ success: false }, { status: 500 }) }
})
vi.mock('@/lib/rate-limit', () => ({ kiRateLimitPruefen: async () => ({ ok: true }) }))
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
process.env.KI_API_KEY = 'ki'

import { POST } from '../route'

const BILD = 'data:image/jpeg;base64,AAAA'
const call = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)
const ARTIKEL = [{ id: 'a1', sku: 'RG-200', name: 'Rahmen 2,00 m', unit: 'Stk', barcode: null }]

describe('ki-lager-lesen', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })

  it('lehnt Nicht-Bilder ab, ohne die KI aufzurufen', async () => {
    expect((await call({ bild: 'hallo' })).status).toBe(400)
    expect((await call({})).status).toBe(400)
    expect((await call({ bild: 'data:text/html;base64,AAAA' })).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('liest Zeilen, gleicht mit dem Stamm ab und bucht nichts', async () => {
    fetchMock.mockImplementation(async (u: string) => {
      if (String(u).includes('/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ belegnummer: 'LS-9', positionen: [{ bezeichnung: 'Rahmen 2,00 m', menge: 40 }, { bezeichnung: 'Kaffeemaschine', menge: 1 }] }) } }] }), { status: 200 })
      return new Response(JSON.stringify(ARTIKEL), { status: 200 })
    })
    const r = await call({ bild: BILD })
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.belegnummer).toBe('LS-9')
    expect(j.positionen[0].treffer).toMatchObject({ sicherheit: 'sicher', artikel: { id: 'a1' } })
    expect(j.positionen[1].treffer.sicherheit).toBe('keiner')
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/lager/') || u.includes('rpc/'))).toBe(false) // keine Buchung
    const ki = fetchMock.mock.calls.find((c) => String(c[0]).includes('/chat/completions'))!
    expect(JSON.parse(ki[1].body).messages[0].content[1].image_url.url).toBe(BILD)
  })
  it('nicht lesbare KI-Antwort: Fehler statt Fantasiedaten', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'kein json' } }] }), { status: 200 }))
    expect((await call({ bild: BILD })).status).toBe(502)
  })
})
