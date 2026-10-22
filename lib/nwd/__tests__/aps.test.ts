import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apsKonfig, apsToken, apsTokenVergessen, urnVon, uebersetze, manifestStand, findeObjDatei, ApsFehler, type ApsKonfig } from '../aps'

const K: ApsKonfig = { clientId: 'id', clientSecret: 'geheim', bucket: 'testbucket' }
const antwort = (body: unknown, status = 200, kopf: Record<string, string> = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: kopf })

const SVF_FERTIG = { status: 'success', derivatives: [{ outputType: 'svf', status: 'success', children: [{ role: '3d', status: 'success' }] }] }
const OBJ_FERTIG = { status: 'success', derivatives: [SVF_FERTIG.derivatives[0], { outputType: 'obj', status: 'success', children: [{ role: 'obj', type: 'resource', urn: 'urn:adsk.viewing:fs.file:abc/output/geometry.obj', status: 'success' }] }] }

describe('apsKonfig', () => {
  it('braucht alle drei Variablen', () => {
    expect(apsKonfig({ APS_CLIENT_ID: 'a', APS_CLIENT_SECRET: 'b' })).toBeNull()
    expect(apsKonfig({ APS_CLIENT_ID: 'a', APS_CLIENT_SECRET: 'b', APS_BUCKET: ' MeinBucket ' })).toEqual({ clientId: 'a', clientSecret: 'b', bucket: 'meinbucket' })
  })
})

describe('APS-Aufrufe (komplett gemockt)', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => { apsTokenVergessen(); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())

  it('holt ein Token und merkt es sich', async () => {
    fetchMock.mockResolvedValue(antwort({ access_token: 'T1', expires_in: 3600 }))
    expect(await apsToken(K)).toBe('T1')
    expect(await apsToken(K)).toBe('T1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/authentication/v2/token')
    expect((init.headers as Record<string, string>).Authorization).toBe('Basic ' + Buffer.from('id:geheim').toString('base64'))
  })

  it('falsche Zugangsdaten → Fehlercode auth', async () => {
    fetchMock.mockResolvedValue(antwort({}, 401))
    await expect(apsToken(K)).rejects.toMatchObject({ code: 'auth' })
  })

  it('403 bei der Anmeldung → auth (Zugangsdaten bzw. Rechte der App)', async () => {
    fetchMock.mockResolvedValue(antwort('forbidden', 403))
    await expect(apsToken(K)).rejects.toMatchObject({ code: 'auth' })
  })

  it('403 beim Start der Übersetzung nach erfolgreicher Anmeldung → kontingent, mit Antworttext von APS', async () => {
    fetchMock.mockResolvedValueOnce(antwort({ access_token: 'T', expires_in: 3600 })).mockResolvedValueOnce(antwort('{"reason":"quota exceeded"}', 403))
    const fehler = await uebersetze(K, 'urn', 'svf').catch((e) => e)
    expect(fehler).toBeInstanceOf(ApsFehler)
    expect(fehler.code).toBe('kontingent')
    expect(fehler.message).toContain('nicht die Zugangsdaten')
    expect(fehler.message).toContain('quota exceeded')
  })

  it('Übersetzung wird von APS abgelehnt → nicht-unterstuetzt', async () => {
    fetchMock.mockResolvedValueOnce(antwort({ access_token: 'T', expires_in: 3600 })).mockResolvedValueOnce(antwort('format not supported', 400))
    await expect(uebersetze(K, 'urn', 'obj', 'guid')).rejects.toMatchObject({ code: 'nicht-unterstuetzt' })
  })

  it('429 → kontingent, Netzfehler → netz', async () => {
    fetchMock.mockResolvedValueOnce(antwort({ access_token: 'T', expires_in: 3600 })).mockResolvedValueOnce(antwort({}, 429))
    await expect(uebersetze(K, 'urn', 'svf')).rejects.toMatchObject({ code: 'kontingent' })
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    await expect(uebersetze(K, 'urn', 'svf')).rejects.toBeInstanceOf(ApsFehler)
  })
})

describe('urnVon', () => {
  it('URL-sicheres Base64 ohne Auffüllung', () => {
    const u = urnVon('urn:adsk.objects:os.object:bucket/datei?>.nwd')
    expect(u).not.toMatch(/[+/=]/)
    expect(Buffer.from(u.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).toBe('urn:adsk.objects:os.object:bucket/datei?>.nwd')
  })
})

describe('manifestStand / findeObjDatei', () => {
  it('kein Manifest → wartet', () => expect(manifestStand(null, 'svf').status).toBe('wartet'))
  it('Stufe 1 läuft, dann fertig', () => {
    expect(manifestStand({ status: 'inprogress', progress: '45% complete', derivatives: [{ outputType: 'svf', status: 'inprogress', progress: '45% complete' }] }, 'svf')).toMatchObject({ status: 'laeuft' })
    expect(manifestStand(SVF_FERTIG, 'svf').status).toBe('fertig')
  })
  it('Stufe 2: SVF fertig reicht NICHT, erst die OBJ-Ableitung', () => {
    expect(manifestStand(SVF_FERTIG, 'obj').status).toBe('wartet')
    expect(manifestStand(OBJ_FERTIG, 'obj').status).toBe('fertig')
    expect(findeObjDatei(OBJ_FERTIG)?.derivatUrn).toContain('geometry.obj')
  })
  it('Fehler mit Meldung wird durchgereicht', () => {
    const m = { status: 'failed', derivatives: [{ outputType: 'svf', status: 'failed', messages: [{ type: 'error', message: 'Datei beschädigt' }] }] }
    expect(manifestStand(m, 'svf')).toMatchObject({ status: 'fehler', fehler: 'Datei beschädigt' })
  })
  it('„Erfolg“ ohne OBJ-Datei ist ein Fehler, kein halber Import', () => {
    const m = { status: 'success', derivatives: [{ outputType: 'obj', status: 'success', children: [] }] }
    expect(manifestStand(m, 'obj').status).toBe('fehler')
  })
})
