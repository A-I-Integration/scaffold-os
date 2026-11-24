import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
let rolle = 'admin'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: rolle } }) }) }) }),
  }),
}))

const E1 = '11111111-1111-4111-8111-111111111111'
let db: Tabellen
let storage: string[]
beforeEach(() => {
  rolle = 'admin'; storage = []
  db = { employees: [{ id: E1, first_name: 'Max', last_name: 'Muster' }], employee_documents: [] }
  const rest = baueFakeRest(db)
  vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) => {
    const s = String(u)
    if (s.includes('/storage/v1/object/sign/')) return new Response(JSON.stringify({ signedURL: '/object/sign/employee-documents/x?token=t' }), { status: 200 })
    if (s.includes('/storage/v1/object/')) { storage.push((init?.method ?? 'GET') + ' ' + s.split('/employee-documents/')[1]); return new Response('{}', { status: 200 }) }
    return rest(u, init)
  })
})
const route = () => import('@/app/api/mitarbeiter-dokumente/route')
const formular = (felder: Record<string, string | File>) => { const f = new FormData(); for (const [k, v] of Object.entries(felder)) f.set(k, v); return f }
const post = async (felder: Record<string, string | File>) => (await route()).POST(new Request('http://x', { method: 'POST', body: formular(felder) }) as never)
const get = async (q = '') => (await route()).GET(new Request('http://x/api/mitarbeiter-dokumente' + q) as never)
const basis = { employee_id: E1, kategorie: 'g_untersuchung', bezeichnung: 'G 41', gueltig_bis: '2027-03-01' }

describe('Route Mitarbeiter-Dokumente', () => {
  it('speichert einen Eintrag ohne Datei und listet ihn mit Namen', async () => {
    expect((await post(basis)).status).toBe(200)
    const j = await (await get()).json()
    expect(j.dokumente).toHaveLength(1)
    expect(j.dokumente[0]).toMatchObject({ bezeichnung: 'G 41', gueltig_bis: '2027-03-01', mitarbeiter: 'Max Muster' })
    expect(storage).toHaveLength(0)
  })
  it('lädt eine PDF-Datei in den privaten Bucket und liefert eine signierte URL', async () => {
    const r = await post({ ...basis, file: new File(['x'], 'g41.pdf', { type: 'application/pdf' }) })
    expect(r.status).toBe(200)
    expect(storage[0]).toMatch(/^POST 1111.*\.pdf$/)
    expect((db.employee_documents[0] as any).file_name).toBe('g41.pdf')
    const id = '44444444-4444-4444-8444-444444444444'
    ;(db.employee_documents[0] as any).id = id
    const sig = await import('@/app/api/mitarbeiter-dokumente/signed-url/route')
    const u = await sig.GET(new Request('http://x/s?id=' + id) as never)
    expect(u.status).toBe(200)
    expect((await u.json()).url).toContain('token=t')
    rolle = 'mitarbeiter'
    expect((await sig.GET(new Request('http://x/s?id=' + id) as never)).status).toBe(403)
  })
  it('lehnt falsche Eingaben und Dateitypen ab', async () => {
    expect((await post({ ...basis, bezeichnung: '' })).status).toBe(400)
    expect((await post({ ...basis, kategorie: 'x' })).status).toBe(400)
    expect((await post({ ...basis, employee_id: 'kaputt' })).status).toBe(400)
    expect((await post({ ...basis, file: new File(['x'], 'a.exe', { type: 'application/x-msdownload' }) })).status).toBe(400)
    expect((await post({ ...basis, employee_id: '22222222-2222-4222-8222-222222222222' })).status).toBe(404)
    expect(db.employee_documents).toHaveLength(0)
  })
  it('Chef und Disposition dürfen, alle anderen nicht', async () => {
    rolle = 'disponent'
    expect((await post(basis)).status).toBe(200)
    for (const r of ['bauleiter', 'mitarbeiter', 'lager']) {
      rolle = r
      expect((await get()).status).toBe(403)
      expect((await post(basis)).status).toBe(403)
    }
    expect(db.employee_documents).toHaveLength(1)
  })
  it('löscht Eintrag und Datei', async () => {
    await post({ ...basis, file: new File(['x'], 'g41.pdf', { type: 'application/pdf' }) })
    const id = '33333333-3333-4333-8333-333333333333'
    ;(db.employee_documents[0] as any).id = id
    const del = (await route()).DELETE(new Request('http://x/d?id=' + id, { method: 'DELETE' }) as never)
    expect((await del).status).toBe(200)
    expect(db.employee_documents).toHaveLength(0)
    expect(storage.some(s => s.startsWith('DELETE'))).toBe(true)
  })
})
