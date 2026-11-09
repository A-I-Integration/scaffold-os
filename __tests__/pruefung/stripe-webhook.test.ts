import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'

// ============================================================
// Tiefenprüfung Stripe-Webhook (Abo-Kauf, Statuswechsel, Wiederholungen, Datenbankfehler)
// Echte Route, Stripe-Signaturprüfung und Provisionierung als Attrappen, Datenbank als Nachbau.
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.STRIPE_SECRET_KEY = 'sk_test'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

const m = vi.hoisted(() => ({ provision: vi.fn(), pause: vi.fn(), restore: vi.fn() }))
vi.mock('stripe', () => ({
  default: class { webhooks = { constructEvent: (payload: string, sig: string) => { if (sig !== 'gueltig') throw new Error('falsche Signatur'); return JSON.parse(payload) } } },
}))
vi.mock('@/lib/provision/orchestrate', () => ({ runProvision: m.provision }))
vi.mock('@/lib/provision/supabase-mgmt', () => ({ pauseSupabaseProject: m.pause, restoreSupabaseProject: m.restore }))
vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server')
  return { serverErrorResponse: () => NextResponse.json({ success: false }, { status: 500 }) }
})
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ error: null }) } } }))

let db: Tabellen
beforeEach(() => {
  m.provision.mockReset(); m.pause.mockReset(); m.restore.mockReset()
  m.provision.mockResolvedValue(undefined)
  db = { subscriptions: [], tenants: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

const kauf = (extra: Record<string, unknown> = {}) => ({
  type: 'checkout.session.completed',
  data: { object: { customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid', customer_email: 'chef@firma.de',
    metadata: { company_name: 'Gerüstbau Müller', admin_email: 'Chef@Firma.de', admin_name: 'Max', plan: 'starter', price_id: 'price_1' }, ...extra } },
})
async function sende(event: unknown, signatur = 'gueltig') {
  const { POST } = await import('@/app/api/stripe/webhook/route')
  return POST(new Request('http://x', { method: 'POST', headers: { 'stripe-signature': signatur }, body: JSON.stringify(event) }) as never)
}

describe('Kauf', () => {
  it('legt Abo und Kundenzugang an und startet die Einrichtung genau einmal', async () => {
    const r = await sende(kauf())
    expect(r.status).toBe(200)
    expect(db.subscriptions).toHaveLength(1)
    expect(db.subscriptions[0]).toMatchObject({ status: 'active', customer_email: 'chef@firma.de', stripe_price_id: 'price_1' })
    expect(db.tenants).toHaveLength(1)
    expect(db.tenants[0]).toMatchObject({ slug: 'geruestbau-mueller', plan: 'starter', status: 'provisioning' })
    expect(db.subscriptions[0].tenant_id).toBe(db.tenants[0].id)
    expect(m.provision).toHaveBeenCalledTimes(1)
  })
  it('SEPA-Kauf mit offener Zahlung bleibt "incomplete"', async () => {
    await sende(kauf({ payment_status: 'unpaid' }))
    expect(db.subscriptions[0].status).toBe('incomplete')
  })
  it('Stripe wiederholt dasselbe Ereignis: kein zweiter Kundenzugang', async () => {
    await sende(kauf()); await sende(kauf())
    expect(db.tenants).toHaveLength(1)
    expect(m.provision).toHaveBeenCalledTimes(1)
  })
  it('zwei Kunden mit gleichem Firmennamen bekommen verschiedene Adressen', async () => {
    await sende(kauf())
    await sende(kauf({ subscription: 'sub_2' }))
    expect(new Set(db.tenants.map((t) => t.slug)).size).toBe(2)
  })
  it('ohne E-Mail oder Abo-Nummer wird nichts angelegt (und Stripe bekommt trotzdem 200)', async () => {
    const r = await sende(kauf({ customer_email: null, metadata: { company_name: 'X' } }))
    expect(r.status).toBe(200)
    expect(db.subscriptions).toHaveLength(0); expect(db.tenants).toHaveLength(0)
  })
  it('scheitert die Einrichtung, wird der Zugang als Fehler markiert, nicht verloren', async () => {
    m.provision.mockRejectedValueOnce(new Error('Vercel down'))
    const r = await sende(kauf())
    expect(r.status).toBe(200)
    expect(db.tenants[0].status).toBe('error')
  })
})

describe('Sicherheit und Konfiguration', () => {
  it('ungültige Signatur: 400 und nichts geschrieben', async () => {
    const r = await sende(kauf(), 'gefaelscht')
    expect(r.status).toBe(400)
    expect(db.subscriptions).toHaveLength(0)
  })
  it('ohne Stripe-Konfiguration: 503', async () => {
    const alt = process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_WEBHOOK_SECRET
    expect((await sende(kauf())).status).toBe(503)
    process.env.STRIPE_WEBHOOK_SECRET = alt
  })
  it('unbekannte Ereignisse werden freundlich ignoriert', async () => {
    expect((await sende({ type: 'charge.refunded', data: { object: {} } })).status).toBe(200)
  })
})

describe('Datenbankfehler dürfen nicht verschluckt werden', () => {
  const ausfall = (muster: RegExp, methode = 'POST') => {
    const echt = fetch
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) =>
      muster.test(String(u)) && (init?.method ?? 'GET') === methode ? new Response('db kaputt', { status: 500 }) : echt(u, init))
  }
  it('Abo kann nicht gespeichert werden → 500, damit Stripe es erneut zustellt', async () => {
    ausfall(/subscriptions/)
    expect((await sende(kauf())).status).toBe(500)
  })
  it('Abo-Prüfung nicht lesbar → 500 und KEIN zweiter Kundenzugang bei der Wiederholung', async () => {
    await sende(kauf())
    ausfall(/subscriptions\?stripe_subscription_id/, 'GET')
    expect((await sende(kauf())).status).toBe(500)
    expect(db.tenants).toHaveLength(1)
  })
  it('nach dem Ausfall erreicht die Wiederholung den Zielzustand', async () => {
    const echt = fetch
    ausfall(/subscriptions/)
    expect((await sende(kauf())).status).toBe(500)
    vi.stubGlobal('fetch', echt)
    expect((await sende(kauf())).status).toBe(200)
    expect(db.subscriptions[0].tenant_id).toBeTruthy()
    expect(db.tenants).toHaveLength(1)
  })
})

describe('Statuswechsel', () => {
  async function mitKunde(status = 'active', ref: string | null = 'proj_1') {
    await sende(kauf())
    db.tenants[0].status = status; db.tenants[0].supabase_project_ref = ref
  }
  const abo = (status: string) => ({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status, cancel_at_period_end: false, trial_end: null } } })

  it('Zahlungsverzug markiert den Zugang, die Instanz läuft weiter', async () => {
    await mitKunde()
    await sende(abo('past_due'))
    expect(db.tenants[0].status).toBe('past_due')
    expect(m.pause).not.toHaveBeenCalled()
  })
  it('Kündigung sperrt und pausiert die Instanz', async () => {
    await mitKunde()
    await sende({ ...abo('canceled'), type: 'customer.subscription.deleted' })
    expect(db.tenants[0].status).toBe('gesperrt')
    expect(m.pause).toHaveBeenCalledWith('proj_1')
  })
  it('Zahlung nach Sperrung reaktiviert die Instanz', async () => {
    await mitKunde('gesperrt')
    await sende(abo('active'))
    expect(db.tenants[0].status).toBe('active')
    expect(m.restore).toHaveBeenCalledWith('proj_1')
  })
  it('aktives Abo ohne Sperrung startet nichts neu', async () => {
    await mitKunde('active')
    await sende(abo('active'))
    expect(m.restore).not.toHaveBeenCalled()
  })
  it('Kündigung ohne Projekt-Referenz: gesperrt, aber kein Aufruf ins Leere', async () => {
    await mitKunde('active', null)
    await sende(abo('canceled'))
    expect(db.tenants[0].status).toBe('gesperrt')
    expect(m.pause).not.toHaveBeenCalled()
  })
  it('fehlgeschlagene Abbuchung setzt das Abo auf past_due', async () => {
    await mitKunde()
    await sende({ type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1' } } })
    expect(db.subscriptions[0].status).toBe('past_due')
  })
})
