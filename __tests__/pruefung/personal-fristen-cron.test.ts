import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.RESEND_API_KEY = 're_test'
process.env.CRON_SECRET = 'geheim'
const mail = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: mail.send } } }))

const tagPlus = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
let db: Tabellen
beforeEach(() => {
  mail.send.mockReset(); mail.send.mockResolvedValue({ error: null })
  db = {
    employees: [{ id: 'a', first_name: 'Max', last_name: 'Muster', status: 'active', license_expires: null }],
    employee_personal: [{ employee_id: 'a', ausweisart: 'aufenthaltstitel', ausweis_gueltig_bis: tagPlus(20), reisepass_gueltig_bis: tagPlus(400) }],
    employee_documents: [{ id: 'd1', employee_id: 'a', bezeichnung: 'G 41', gueltig_bis: tagPlus(10) }],
    personal_erinnerungen: [],
    company_settings: [{ id: '00000000-0000-0000-0000-000000000001', email: 'chef@firma.de' }],
  }
  const rest = baueFakeRest(db)
  vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) => {
    if (String(u).includes('personal_erinnerungen') && init?.method === 'POST') { db.personal_erinnerungen.push(...JSON.parse(String(init.body))); return new Response('', { status: 201 }) }
    return rest(u, init)
  })
})
const aufruf = async (secret = 'geheim') => (await import('@/app/api/cron/personal-fristen/route')).GET(new Request('http://x', { headers: { authorization: `Bearer ${secret}` } }) as never)

describe('Cron: Personal-Fristen', () => {
  it('schickt eine Mail mit allen Fristen innerhalb von 30 Tagen, ohne Nummern, und merkt sich das', async () => {
    const r = await aufruf()
    const j = await r.json()
    expect(j.versendet).toBe(true); expect(mail.send).toHaveBeenCalledTimes(1)
    const m = mail.send.mock.calls[0][0]
    expect(m.to).toBe('chef@firma.de')
    expect(m.html).toContain('Max Muster'); expect(m.html).toContain('Aufenthaltstitel'); expect(m.html).toContain('G 41')
    expect(db.personal_erinnerungen).toHaveLength(2)
    // zweiter Lauf am selben Tag: nichts mehr
    await aufruf()
    expect(mail.send).toHaveBeenCalledTimes(1)
  })
  it('markiert nichts, wenn der Versand fehlschlägt (nächster Tag versucht es erneut)', async () => {
    mail.send.mockResolvedValue({ error: { message: 'down' } })
    expect((await aufruf()).status).toBe(502)
    expect(db.personal_erinnerungen).toHaveLength(0)
  })
  it('ohne Firmen-E-Mail wird nichts versendet; falsches Secret wird abgewiesen', async () => {
    db.company_settings = [{ id: '00000000-0000-0000-0000-000000000001', email: '' }]
    expect((await (await aufruf()).json()).grund).toContain('Firmen-E-Mail')
    expect(mail.send).not.toHaveBeenCalled()
    expect((await aufruf('falsch')).status).toBe(401)
  })
})
