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

let db: Tabellen
beforeEach(() => { db = { customers: [] }; vi.stubGlobal('fetch', baueFakeRest(db)) })

describe('Land beim Kunden', () => {
  it('Kunde anlegen speichert das Land', async () => {
    const { POST } = await import('@/app/api/kunden/route')
    const r = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ name: 'Lux Bau', land: 'Luxemburg' }) }) as never)
    expect(r.status).toBe(200)
    expect((db.customers[0] as any).land).toBe('Luxemburg')
  })
  it('Ohne Land (= Deutschland) wird keine Spalte geschrieben', async () => {
    const { POST } = await import('@/app/api/kunden/route')
    await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ name: 'DE Bau' }) }) as never)
    expect((db.customers[0] as any).land ?? null).toBeNull()
  })
  it('Ungültiges Land wird abgelehnt', async () => {
    const { POST } = await import('@/app/api/kunden/route')
    const r = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ name: 'X', land: '<x>' }) }) as never)
    expect(r.status).toBe(400)
    expect(db.customers).toHaveLength(0)
  })
})
