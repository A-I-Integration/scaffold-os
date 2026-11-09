import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'

const annahme = vi.hoisted(() => ({ aufrufe: [] as string[] }))
vi.mock('@/lib/angebot-annahme', () => ({ beiAngebotsannahmeSicher: async (id: string) => { annahme.aufrufe.push(id) } }))
vi.mock('@/lib/notify', () => ({ notifyAngebotRueckmeldung: async () => {} }))
vi.mock('next/server', async () => {
  const echt = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...echt, after: (f: () => unknown) => { void f() } }
})

const TOKEN = 'a'.repeat(48)
const ANDERER = 'b'.repeat(48)
const in1h = new Date(Date.now() + 3600000).toISOString()
const vor1h = new Date(Date.now() - 3600000).toISOString()
let db: Tabellen

beforeEach(() => {
  annahme.aufrufe = []
  db = {
    project_stand_links: [
      { token: TOKEN, project_id: 'p1', expires_at: in1h, revoked_at: null },
      { token: 'c'.repeat(48), project_id: 'p1', expires_at: vor1h, revoked_at: null },
      { token: 'd'.repeat(48), project_id: 'p1', expires_at: in1h, revoked_at: vor1h },
    ],
    projects: [
      { id: 'p1', name: 'Haus Muster', adresse: 'Weg 1', data: { nachtraege: [], interneNotiz: 'GEHEIM', kiResult: { suggestedPrice: 1000 } } },
      { id: 'p2', name: 'Fremdes Projekt', adresse: 'Weg 2', data: {} },
    ],
    invoices: [
      { id: 'i1', project_id: 'p1', invoice_number: 'RE-1', status: 'offen', net_amount: 100, gross_amount: 119, tax_rate: 19, tax_amount: 19, paid_amount: 0, positions: [], reminder_level: 2, mahnung_pause_grund: 'GEHEIM', invoice_date: '2026-01-01' },
      { id: 'i2', project_id: 'p2', invoice_number: 'RE-FREMD', status: 'offen', net_amount: 5, gross_amount: 6, invoice_date: '2026-01-01' },
    ],
    company_settings: [{ id: '00000000-0000-0000-0000-000000000001', company_name: 'Firma', phone: '1', email: 'a@b.de' }],
    invoice_attachments: [],
    project_access_tokens: [{ token: TOKEN, project_id: 'p1' }],
  }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

const auftrag = async (token: string) => (await import('@/app/api/public/auftrag/route')).GET({ nextUrl: new URL(`http://x/api/public/auftrag?token=${token}`) } as never)

describe('Öffentlicher Auftragsstand', () => {
  it('gültiger Link zeigt nur die eigene Baustelle und keine internen Felder', async () => {
    const r = await auftrag(TOKEN)
    expect(r.status).toBe(200)
    const text = JSON.stringify(await r.json())
    expect(text).toContain('Haus Muster')
    expect(text).toContain('RE-1')
    expect(text).not.toContain('RE-FREMD')
    expect(text).not.toContain('Fremdes Projekt')
    expect(text).not.toContain('GEHEIM')
    expect(text).not.toContain('reminder')
  })
  it.each([['abgelaufen', 'c'.repeat(48)], ['widerrufen', 'd'.repeat(48)], ['unbekannt', ANDERER], ['zu kurz', 'abc'], ['leer', ''], ['mit Sonderzeichen', "x' or 1=1 --"]])('%s → 404', async (_n, t) => {
    expect((await auftrag(t)).status).toBe(404)
  })
})

describe('Öffentliche Angebotsannahme', () => {
  const post = async (body: object) => (await import('@/app/api/public/angebot/route')).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)
  beforeEach(() => { db.projects[0].data = { angebotsStatus: 'versendet', kiResult: {} } })

  it('Annahme löst die Lager-Automatik genau einmal aus, die zweite Annahme nicht', async () => {
    expect((await post({ token: TOKEN })).status).toBe(200)
    const zweite = await (await post({ token: TOKEN })).json()
    expect(zweite.bereitsAngenommen).toBe(true)
    expect(annahme.aufrufe).toEqual(['p1'])
  })
  it('Korrektur braucht eine Notiz; Ablehnen nach Annahme ist nicht mehr möglich', async () => {
    expect((await post({ token: TOKEN, art: 'korrektur', notiz: '' })).status).toBe(400)
    await post({ token: TOKEN })
    const r = await post({ token: TOKEN, art: 'ablehnen' })
    expect(r.status).toBe(409)
    expect((db.projects[0].data as { angebotsStatus: string }).angebotsStatus).toBe('angenommen')
  })
  it('falscher Token → 404, nichts verändert', async () => {
    expect((await post({ token: ANDERER })).status).toBe(404)
    expect((db.projects[0].data as { angebotsStatus: string }).angebotsStatus).toBe('versendet')
    expect(annahme.aufrufe).toEqual([])
  })
  it('Korrektur lässt die Lager-Automatik aus', async () => {
    await post({ token: TOKEN, art: 'korrektur', notiz: 'Bitte Fläche prüfen' })
    expect(annahme.aufrufe).toEqual([])
  })
})
