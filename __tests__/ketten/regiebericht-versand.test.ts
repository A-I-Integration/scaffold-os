import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.RESEND_API_KEY = 're_test'
const ctx = vi.hoisted(() => ({ rolle: 'admin', gesendet: [] as Record<string, unknown>[] }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: ctx.rolle } }) }) }) }),
  }),
}))
vi.mock('resend', () => ({ Resend: class { emails = { send: async (m: Record<string, unknown>) => { ctx.gesendet.push(m); return { data: { id: 'x' }, error: null } } } } }))

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let db: Tabellen
beforeEach(() => {
  ctx.rolle = 'admin'; ctx.gesendet = []
  db = { regieberichte: [{ id: ID, nummer: 'RB-2026-0001', project_id: P1, datum: '2026-11-20', status: 'entwurf', stunden: [{ name: 'Max', stunden: 8, satz: 50 }], material: [], fotos: [], beschreibung: 'Test' }], projects: [{ id: P1, name: 'Haus', adresse: 'Weg 1' }], customers: [], company_settings: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
async function senden(b: Record<string, unknown>) { const { POST } = await import('@/app/api/regieberichte/versand/route'); return POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never) }

describe('Regiebericht per Mail', () => {
  it('sendet das PDF an den Bauherrn und setzt den Status auf versendet', async () => {
    const r = await senden({ id: ID, to: 'bauherr@example.com' })
    expect(r.status).toBe(200)
    expect(ctx.gesendet).toHaveLength(1)
    const m = ctx.gesendet[0] as { to: string[]; subject: string; attachments: { filename: string; content: string }[] }
    expect(m.to).toEqual(['bauherr@example.com'])
    expect(m.subject).toContain('RB-2026-0001')
    expect(m.attachments[0].filename).toBe('RB-2026-0001.pdf')
    expect(Buffer.from(m.attachments[0].content, 'base64').subarray(0, 5).toString()).toBe('%PDF-')
    expect(db.regieberichte[0].status).toBe('versendet')
    expect(db.regieberichte[0].versendet_an).toBe('bauherr@example.com')
  })
  it('ungültige Adresse und fehlende Berechtigung', async () => {
    expect((await senden({ id: ID, to: 'kein-mail' })).status).toBe(400)
    ctx.rolle = 'bauleiter'
    expect((await senden({ id: ID, to: 'a@b.de' })).status).toBe(403)
    expect(ctx.gesendet).toHaveLength(0)
  })
  it('abgerechnete Berichte werden nicht mehr versendet', async () => {
    db.regieberichte[0].rechnung_id = 'r1'
    expect((await senden({ id: ID, to: 'a@b.de' })).status).toBe(409)
    expect(ctx.gesendet).toHaveLength(0)
  })
  it('ein unterschriebener Bericht behält beim Zweitversand seinen Status', async () => {
    db.regieberichte[0].status = 'unterschrieben'
    expect((await senden({ id: ID, to: 'a@b.de' })).status).toBe(200)
    expect(db.regieberichte[0].status).toBe('unterschrieben')
  })
})
