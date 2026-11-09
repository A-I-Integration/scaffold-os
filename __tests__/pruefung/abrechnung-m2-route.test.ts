import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }),
  }),
}))
let db: Tabellen
beforeEach(() => { db = { abrechnung_m2: [] }; vi.stubGlobal('fetch', baueFakeRest(db)) })

const post = async (preis: unknown) => {
  const { POST } = await import('@/app/api/abrechnung-m2/route')
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ art: 'grundpreis', name: 'Fassadengerüst', preis_m2: preis }) }) as never)
}

describe('Abrechnung m²: gespeicherter Preis = geprüfter Preis', () => {
  it.each([
    ['12,50', 12.5], ['1.250,50', 1250.5], ['12.5', 12.5], ['8', 8], [8.75, 8.75], ['0,99', 0.99],
  ])('Eingabe %s wird als %s gespeichert', async (eingabe, erwartet) => {
    const r = await post(eingabe)
    expect(r.status).toBe(200)
    expect(Number(db.abrechnung_m2[0].preis_m2)).toBe(erwartet)
  })
  it.each(['abc', '', '-5', '10001', '1,2,3x'])('ungültige Eingabe %s wird abgewiesen und nichts gespeichert', async (eingabe) => {
    const r = await post(eingabe)
    expect(r.status).toBe(400)
    expect(db.abrechnung_m2).toHaveLength(0)
  })
})
