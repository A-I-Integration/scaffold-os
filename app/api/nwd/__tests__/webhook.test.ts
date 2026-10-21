import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const weiter = vi.fn(async (j: unknown) => j)
const perUrn = vi.fn(async (urn: string) => (urn === 'URN-1' ? { id: 'j1', status: 'konvertierung' } : null))
vi.mock('@/lib/nwd/job', () => ({ fuehreWeiter: (...a: unknown[]) => weiter(...(a as [unknown])), standardAbhaengigkeiten: () => ({ speicher: { perUrn } }) }))

import { POST } from '../webhook/route'

const anfrage = (kopf: Record<string, string>, body: unknown, query = '') =>
  new Request(`http://localhost/api/nwd/webhook${query}`, { method: 'POST', headers: { 'content-type': 'application/json', ...kopf }, body: JSON.stringify(body) }) as never

describe('POST /api/nwd/webhook', () => {
  beforeEach(() => { weiter.mockClear(); process.env.APS_WEBHOOK_SECRET = 'richtig' })
  afterEach(() => { delete process.env.APS_WEBHOOK_SECRET })

  it('falsches Geheimnis → 401, es passiert nichts', async () => {
    const r = await POST(anfrage({ 'x-nwd-secret': 'falsch' }, { payload: { URN: 'URN-1' } }))
    expect(r.status).toBe(401)
    expect(perUrn).not.toHaveBeenCalled()
    expect(weiter).not.toHaveBeenCalled()
  })
  it('kein Geheimnis → 401', async () => {
    expect((await POST(anfrage({}, { payload: { URN: 'URN-1' } }))).status).toBe(401)
  })
  it('Geheimnis fast richtig (andere Länge) → 401', async () => {
    expect((await POST(anfrage({ 'x-nwd-secret': 'richtig!' }, {}))).status).toBe(401)
  })
  it('auf dem Server nicht konfiguriert → 503 (nie offen)', async () => {
    delete process.env.APS_WEBHOOK_SECRET
    expect((await POST(anfrage({ 'x-nwd-secret': 'irgendwas' }, {}))).status).toBe(503)
  })
  it('richtiges Geheimnis im Header → Job wird weitergeführt', async () => {
    const r = await POST(anfrage({ 'x-nwd-secret': 'richtig' }, { payload: { URN: 'URN-1' } }))
    expect(r.status).toBe(200)
    expect(weiter).toHaveBeenCalledTimes(1)
  })
  it('richtiges Geheimnis als ?token= funktioniert ebenfalls', async () => {
    expect((await POST(anfrage({}, { resourceUrn: 'URN-1' }, '?token=richtig'))).status).toBe(200)
    expect(weiter).toHaveBeenCalledTimes(1)
  })
  it('unbekannte URN → 200 ohne Wirkung', async () => {
    const r = await POST(anfrage({ 'x-nwd-secret': 'richtig' }, { payload: { URN: 'fremd' } }))
    expect(r.status).toBe(200)
    expect(weiter).not.toHaveBeenCalled()
  })
})
