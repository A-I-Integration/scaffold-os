import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/anhang-storage', () => ({ downloadLink: vi.fn(async () => 'https://storage.example/signed?x=1') }))

const TOKEN = 'a'.repeat(48)
const AID = '11111111-1111-4111-8111-111111111111'
const PID = '22222222-2222-4222-8222-222222222222'
const IID = '33333333-3333-4333-8333-333333333333'

function req(token = TOKEN, id = AID) {
  return new NextRequest(`http://x/api/public/auftrag/anhang?token=${token}&id=${id}`)
}
const json = (body: unknown, ok = true) => ({ ok, json: async () => body, text: async () => JSON.stringify(body) })

describe('GET /api/public/auftrag/anhang', () => {
  let urls: string[]
  beforeEach(() => { urls = []; vi.resetModules() })

  async function lade(antworten: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(String(u))
      for (const k of Object.keys(antworten)) if (String(u).includes(k)) return antworten[k]
      return json([])
    }))
    return (await import('@/app/api/public/auftrag/anhang/route')).GET
  }

  it('leitet auf den Download um, wenn Link, Freigabe und Baustelle passen', async () => {
    const GET = await lade({
      project_stand_links: json([{ project_id: PID, expires_at: null, revoked_at: null }]),
      invoice_attachments: json([{ storage_path: 'p/x.pdf', file_name: 'x.pdf', invoice_id: IID }]),
      '/invoices?': json([{ id: IID }]),
    })
    const res = await GET(req())
    expect(res.status).toBe(302)
    expect(urls.some((u) => u.includes('fuer_auftraggeber=eq.true') && u.includes('bestaetigt_am=not.is.null'))).toBe(true)
    expect(urls.some((u) => u.includes(`/invoices?id=eq.${IID}&project_id=eq.${PID}`))).toBe(true)
  })

  it('404 bei widerrufenem Link', async () => {
    const GET = await lade({ project_stand_links: json([{ project_id: PID, expires_at: null, revoked_at: '2026-01-01T00:00:00Z' }]) })
    expect((await GET(req())).status).toBe(404)
  })

  it('404, wenn der Anhang nicht freigegeben ist (Abfrage liefert nichts)', async () => {
    const GET = await lade({ project_stand_links: json([{ project_id: PID, expires_at: null, revoked_at: null }]), invoice_attachments: json([]) })
    expect((await GET(req())).status).toBe(404)
  })

  it('404, wenn die Rechnung zu einer anderen Baustelle gehört', async () => {
    const GET = await lade({
      project_stand_links: json([{ project_id: PID, expires_at: null, revoked_at: null }]),
      invoice_attachments: json([{ storage_path: 'p/x.pdf', file_name: 'x.pdf', invoice_id: IID }]),
      '/invoices?': json([]),
    })
    expect((await GET(req())).status).toBe(404)
  })

  it('404 bei ungültigem Token oder ungültiger ID, ohne Datenbankzugriff', async () => {
    const GET = await lade({})
    expect((await GET(req('zz'))).status).toBe(404)
    expect((await GET(req(TOKEN, 'nicht-uuid'))).status).toBe(404)
    expect(urls.length).toBe(0)
  })
})
