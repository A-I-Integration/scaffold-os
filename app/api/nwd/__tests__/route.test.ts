import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const auth = vi.fn(async () => ({ userId: 'u1' }) as { userId: string } | null)
vi.mock('@/lib/auth', () => ({
  requireAuth: () => auth(),
  unauthorizedResponse: () => new Response(JSON.stringify({ success: false }), { status: 401 }),
  serverErrorResponse: () => new Response(JSON.stringify({ success: false }), { status: 500 }),
}))
const darf = vi.fn(async () => true)
vi.mock('@/lib/nwd/zugang', () => ({ darfNwdKonvertieren: () => darf(), ergebnisUrl: (p: string) => `https://x/${p}`, geheimnisGleich: () => false }))
const signiert = vi.fn(async () => ({ uploadKey: 'KEY', url: 'https://s3.example/put' }))
vi.mock('@/lib/nwd/aps', async (orig) => ({ ...(await orig<typeof import('@/lib/nwd/aps')>()), signierteUploadUrl: () => signiert() }))

const speicher = {
  anlegen: vi.fn(async (j: Record<string, unknown>) => ({ id: 'j1', ...j })),
  aendern: vi.fn(async () => true), letzterStart: vi.fn(async () => null as number | null),
  anzahlSeit: vi.fn(async () => 0), veraltet: vi.fn(async () => []), holen: vi.fn(), perUrn: vi.fn(),
}
vi.mock('@/lib/nwd/job', async (orig) => ({ ...(await orig<typeof import('@/lib/nwd/job')>()), standardAbhaengigkeiten: () => ({ speicher, ablage: {}, aps: {}, konfig: { clientId: 'a', clientSecret: 'b', bucket: 'c' }, jetzt: () => Date.now() }) }))

import { POST } from '../route'

const anfrage = (body: unknown) => new Request('http://localhost/api/nwd', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never
const gut = { dateiname: 'wuppertal.nwd', bytes: 50_000_000 }

describe('POST /api/nwd', () => {
  beforeEach(() => {
    vi.clearAllMocks(); auth.mockResolvedValue({ userId: 'u1' }); darf.mockResolvedValue(true)
    speicher.letzterStart.mockResolvedValue(null); speicher.anzahlSeit.mockResolvedValue(0)
    process.env.APS_CLIENT_ID = 'a'; process.env.APS_CLIENT_SECRET = 'b'; process.env.APS_BUCKET = 'c'
    delete process.env.NWD_TAGESLIMIT
  })
  afterEach(() => { delete process.env.APS_CLIENT_ID; delete process.env.APS_CLIENT_SECRET; delete process.env.APS_BUCKET })

  it('nicht angemeldet → 401', async () => {
    auth.mockResolvedValue(null)
    expect((await POST(anfrage(gut))).status).toBe(401)
  })
  it('Rolle ohne CAD-Zugriff → 403', async () => {
    darf.mockResolvedValue(false)
    expect((await POST(anfrage(gut))).status).toBe(403)
  })
  it('keine .nwd-Datei / zu groß / leer → 400', async () => {
    expect((await POST(anfrage({ dateiname: 'a.ifc', bytes: 10 }))).status).toBe(400)
    expect((await POST(anfrage({ dateiname: 'a.nwd', bytes: 201 * 1024 * 1024 }))).status).toBe(400)
    expect((await POST(anfrage({ dateiname: 'a.nwd', bytes: 0 }))).status).toBe(400)
  })
  it('Autodesk-Zugang fehlt → 503 mit ehrlicher Meldung, kein Auftrag', async () => {
    delete process.env.APS_CLIENT_ID
    const r = await POST(anfrage(gut))
    expect(r.status).toBe(503)
    expect((await r.json()).error).toMatch(/nicht eingerichtet/)
    expect(speicher.anlegen).not.toHaveBeenCalled()
  })
  it('Erfolg → Auftrag + Upload-Adresse', async () => {
    const r = await POST(anfrage(gut))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ success: true, id: 'j1', uploadUrl: 'https://s3.example/put', uploadKey: 'KEY' })
    expect(speicher.anlegen).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', dateiname: 'wuppertal.nwd' }))
  })
  it('zweiter Start innerhalb einer Minute → 429, kein neuer Auftrag, keine Autodesk-Kosten', async () => {
    speicher.letzterStart.mockResolvedValue(Date.now() - 10_000)
    const r = await POST(anfrage(gut))
    expect(r.status).toBe(429)
    expect(r.headers.get('Retry-After')).toBeTruthy()
    expect(speicher.anlegen).not.toHaveBeenCalled()
    expect(signiert).not.toHaveBeenCalled()
  })
  it('Tageslimit erreicht → 429', async () => {
    process.env.NWD_TAGESLIMIT = '2'
    speicher.anzahlSeit.mockResolvedValue(2)
    const r = await POST(anfrage(gut))
    expect(r.status).toBe(429)
    expect((await r.json()).grund).toBe('tag')
    expect(speicher.anlegen).not.toHaveBeenCalled()
  })
  it('Autodesk-Upload-Adresse schlägt fehl → Auftrag als Fehler markiert, verständliche Meldung', async () => {
    const { ApsFehler } = await import('@/lib/nwd/aps')
    signiert.mockRejectedValueOnce(new ApsFehler('auth', 'x', 401))
    const r = await POST(anfrage(gut))
    expect(r.status).toBe(502)
    expect(speicher.aendern).toHaveBeenCalledWith('j1', expect.objectContaining({ status: 'fehler' }))
  })
})
