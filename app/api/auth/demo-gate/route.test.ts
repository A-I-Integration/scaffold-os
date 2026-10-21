import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const anfrage = (body: object) => new Request('http://x/api/auth/demo-gate', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '1.2.3.4' } }) as never

describe('Demo-Gate: IP-Sperre', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    process.env.DEMO_LOGIN_EMAIL = 'demo@test.de'
  })
  afterEach(() => { delete process.env.DEMO_IP_SPERRE; vi.unstubAllGlobals() })

  it('ist standardmäßig aus: nie gesperrt, es wird nichts gelesen oder gespeichert', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const { POST } = await import('./route')
    const r = await POST(anfrage({ email: 'demo@test.de', phase: 'check' }))
    expect(r.status).toBe(200)
    expect((await r.json()).gesperrt).toBe(false)
    await POST(anfrage({ email: 'demo@test.de', phase: 'register' }))
    expect(f).not.toHaveBeenCalled()
  })

  it('sperrt wieder, wenn DEMO_IP_SPERRE=1 gesetzt ist und die IP im Fenster bekannt ist', async () => {
    process.env.DEMO_IP_SPERRE = '1'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ ip: '1.2.3.4' }]), { status: 200 })))
    const { POST } = await import('./route')
    const r = await POST(anfrage({ email: 'demo@test.de', phase: 'check' }))
    expect(r.status).toBe(403)
  })

  it('andere E-Mail-Adressen und Instanzen ohne Demo-Login bleiben unberührt', async () => {
    const { POST } = await import('./route')
    expect((await (await POST(anfrage({ email: 'kunde@firma.de', phase: 'check' }))).json()).demo).toBe(false)
    delete process.env.DEMO_LOGIN_EMAIL
    vi.resetModules()
    const m = await import('./route')
    expect((await (await m.POST(anfrage({ email: 'demo@test.de', phase: 'check' }))).json()).demo).toBe(false)
  })
})
