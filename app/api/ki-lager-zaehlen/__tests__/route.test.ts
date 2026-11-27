import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server')
  return { pruefeRolle: async () => ({ ok: true, userId: 'u1', role: 'lager' }), serverErrorResponse: () => NextResponse.json({ success: false }, { status: 500 }) }
})
vi.mock('@/lib/rate-limit', () => ({ kiRateLimitPruefen: async () => ({ ok: true }) }))
process.env.KI_API_KEY = 'ki'

import { POST } from '../route'

const BILD = 'data:image/jpeg;base64,AAAA'
const call = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)
const ART = [{ name: 'Rahmen 2,00 m' }, { name: 'Diagonale 2,50 m' }]

describe('ki-lager-zaehlen', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })

  it('lehnt Nicht-Bilder und fehlende Artikelliste ab, ohne die KI aufzurufen', async () => {
    expect((await call({ bild: 'x', artikel: ART })).status).toBe(400)
    expect((await call({ bild: BILD })).status).toBe(400)
    expect((await call({ bild: BILD, artikel: [{ name: '' }] })).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('schickt eine nummerierte Liste und bereinigt die Antwort (nur Nummern aus der Liste)', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ zaehlung: [{ nr: 1, anzahl: 12, sicherheit: 'mittel' }, { nr: 7, anzahl: 5 }], hinweis: null }) } }] }), { status: 200 }))
    const r = await call({ bild: BILD, artikel: ART })
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.zaehlung).toEqual([{ nr: 1, anzahl: 12, sicherheit: 'mittel' }])
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content[0].text
    expect(prompt).toContain('1. Rahmen 2,00 m'); expect(prompt).toContain('2. Diagonale 2,50 m')
  })
  it('nicht lesbare KI-Antwort: Fehler statt Fantasiezahlen', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }))
    expect((await call({ bild: BILD, artikel: ART })).status).toBe(502)
  })
})
