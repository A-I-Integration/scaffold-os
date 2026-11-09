import { describe, it, expect, vi, beforeEach } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'

const stripeEvent = vi.hoisted(() => ({ event: null as unknown }))
vi.mock('stripe', () => ({ default: class { webhooks = { constructEvent: () => stripeEvent.event } } }))
vi.mock('@/lib/provision/orchestrate', () => ({ runProvision: vi.fn() }))
vi.mock('@/lib/provision/supabase-mgmt', () => ({ pauseSupabaseProject: vi.fn(), restoreSupabaseProject: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  pruefeRolle: async () => ({ ok: true, userId: 'u1', rolle: 'admin' }),
  serverErrorResponse: () => new Response(JSON.stringify({ success: false }), { status: 500 }),
}))
const imap = vi.hoisted(() => ({ uids: [] as number[], geholt: [] as number[] }))
vi.mock('imapflow', () => ({
  ImapFlow: class {
    async connect() {}
    async logout() {}
    async list() { return [] }
    async getMailboxLock() { return { release() {} } }
    async search() { return imap.uids }
    async *fetch(uids: number[]) { for (const u of uids) { imap.geholt.push(u); yield { uid: u, source: Buffer.from('x') } } }
  },
}))
vi.mock('mailparser', () => ({ simpleParser: async () => ({ from: { value: [{ address: 'kunde@test.de' }], text: 'kunde@test.de' }, subject: 's', date: new Date(), text: 't' }) }))
vi.mock('@/lib/email-crypto', () => ({ entschluesseln: () => 'pw' }))

let db: Tabellen
beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk'; process.env.STRIPE_WEBHOOK_SECRET = 'wh'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://sb.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
})

const webhook = async () => {
  const { POST } = await import('@/app/api/stripe/webhook/route')
  return POST(new Request('http://x', { method: 'POST', body: '{}', headers: { 'stripe-signature': 's' } }) as never)
}

describe('Stripe-Webhook: Lesefehler werden nicht als Erfolg gemeldet', () => {
  const kuendigung = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', cancel_at_period_end: false } } }

  it('Abo-Kündigung bei Lesefehler auf tenants → 500, damit Stripe es erneut zustellt', async () => {
    db = { subscriptions: [{ id: 's1', stripe_subscription_id: 'sub_1', tenant_id: 't1' }], tenants: [{ id: 't1', status: 'active' }] }
    const fake = baueFakeRest(db)
    vi.stubGlobal('fetch', async (u: string, i?: RequestInit) => String(u).includes('/rest/v1/tenants') && (i?.method ?? 'GET') === 'GET' ? new Response('kaputt', { status: 500 }) : fake(u, i))
    stripeEvent.event = kuendigung
    expect((await webhook()).status).toBe(500)
  })

  it('Abo-Kündigung bei Lesefehler auf subscriptions (Tenant-Suche) → 500', async () => {
    db = { subscriptions: [{ id: 's1', stripe_subscription_id: 'sub_1', tenant_id: 't1' }], tenants: [{ id: 't1', status: 'active' }] }
    const fake = baueFakeRest(db)
    let leseZaehler = 0
    vi.stubGlobal('fetch', async (u: string, i?: RequestInit) => {
      if (String(u).includes('select=tenant_id') && (i?.method ?? 'GET') === 'GET') { leseZaehler++; return new Response('kaputt', { status: 500 }) }
      return fake(u, i)
    })
    stripeEvent.event = kuendigung
    expect((await webhook()).status).toBe(500)
    expect(leseZaehler).toBe(1)
  })

  it('ohne Fehler: 200 und Tenant gesperrt', async () => {
    db = { subscriptions: [{ id: 's1', stripe_subscription_id: 'sub_1', tenant_id: 't1' }], tenants: [{ id: 't1', status: 'active' }] }
    vi.stubGlobal('fetch', baueFakeRest(db))
    stripeEvent.event = kuendigung
    expect((await webhook()).status).toBe(200)
    expect(db.tenants[0].status).toBe('gesperrt')
  })
})

describe('IMAP-Synchronisierung lädt die ganze Historie nach', () => {
  const sync = async () => {
    const { GET } = await import('@/app/api/kunden/[id]/emails/route')
    return (await GET(new Request('http://x') as never, { params: Promise.resolve({ id: 'k1' }) })).json()
  }
  beforeEach(() => {
    imap.geholt = []
    db = { customers: [{ id: 'k1', email: 'kunde@test.de' }], email_accounts: [{ id: 'a1', email_address: 'b@test.de', employee_id: 'u1', imap_host: 'h', imap_port: 993, imap_secure: true, encrypted_password: 'x' }], customer_emails: [] }
  })
  const speichernMitDuplikatschutz = () => {
    const fake = baueFakeRest(db)
    vi.stubGlobal('fetch', async (u: string, i?: RequestInit) => {
      if (String(u).includes('/rest/v1/customers?')) return new Response(JSON.stringify(db.customers), { status: 200 })
      if (String(u).includes('/rest/v1/email_accounts')) return new Response(JSON.stringify(db.email_accounts), { status: 200 })
      if ((i?.method ?? 'GET') === 'POST' && String(u).includes('customer_emails')) {
        for (const z of JSON.parse(String(i?.body))) db.customer_emails.push(z)
        return new Response('[]', { status: 201 })
      }
      return fake(u, i)
    })
  }

  it('250 Nachrichten: mehrere Durchläufe holen alle, nichts doppelt', async () => {
    imap.uids = Array.from({ length: 250 }, (_, i) => i + 1)
    speichernMitDuplikatschutz()
    for (let i = 0; i < 4; i++) await sync()
    expect(db.customer_emails.length).toBe(250)
    expect(new Set(db.customer_emails.map((z) => z.imap_uid)).size).toBe(250)
    expect(imap.geholt.length).toBe(250)
  })

  it('der erste Durchlauf holt die NEUESTEN zuerst', async () => {
    imap.uids = Array.from({ length: 250 }, (_, i) => i + 1)
    speichernMitDuplikatschutz()
    await sync()
    expect(Math.min(...db.customer_emails.map((z) => Number(z.imap_uid)))).toBe(151)
  })

  it('Speichern schlägt fehl → Fehler wird gemeldet', async () => {
    imap.uids = [1, 2]
    const fake = baueFakeRest(db)
    vi.stubGlobal('fetch', async (u: string, i?: RequestInit) => (i?.method ?? 'GET') === 'POST' ? new Response('kaputt', { status: 500 }) : String(u).includes('/rest/v1/customers?') ? new Response(JSON.stringify(db.customers)) : String(u).includes('email_accounts') ? new Response(JSON.stringify(db.email_accounts)) : fake(u, i))
    const r = await sync()
    expect(r.fehler?.[0]).toContain('speichern fehlgeschlagen')
  })
})
