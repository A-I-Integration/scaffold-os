import { describe, it, expect, vi } from 'vitest'
import { konvertiereNwd, leseNwdErgebnis } from '../nwd-client'

const ant = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const datei = new File([new Uint8Array(1000)], 'haus.nwd')
const OBJ = 'v 0 0 0\nv 10 0 0\nv 0 5 0\nf 1 2 3\n'

function bau(folge: Array<Record<string, unknown>>) {
  const aufrufe: string[] = []
  let i = 0
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url), m = init?.method ?? 'GET'
    aufrufe.push(`${m} ${u}`)
    if (u === '/api/nwd' && m === 'POST') return ant({ success: true, id: 'J1', uploadUrl: 'https://s3/put', uploadKey: 'K' })
    if (u === '/api/nwd/J1' && m === 'POST') return ant(folge[i++] ?? {})
    if (u === '/api/nwd/J1' && m === 'GET') return ant(folge[i++] ?? {})
    if (u === '/api/nwd/J1' && m === 'DELETE') return ant({ success: true })
    if (u === 'https://ergebnis/obj') return new Response(OBJ)
    return ant({}, 404)
  }) as unknown as typeof fetch
  return { fetchFn, aufrufe }
}
const optionen = (fetchFn: typeof fetch, extra = {}) => ({ fetchFn, hochladen: vi.fn(async (_u: string, _d: Blob, an: (a: number) => void) => { an(0.5); an(1) }), warten: vi.fn(async () => undefined), abfrageMs: 20_000, ...extra })

describe('konvertiereNwd (Server und Autodesk gemockt)', () => {
  it('Upload → Konvertierung (mit Abfragen) → Einlesen → Aufräumen', async () => {
    const { fetchFn, aufrufe } = bau([{ status: 'konvertierung' }, { status: 'konvertierung', fortschritt: '40 % umgewandelt' }, { status: 'fertig', format: 'obj', ergebnisUrl: 'https://ergebnis/obj' }])
    const phasen: string[] = []
    const o = optionen(fetchFn, { onFortschritt: (p: string) => { if (!phasen.includes(p)) phasen.push(p) } })
    const r = await konvertiereNwd(datei, o)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.dreiecke.length).toBe(9)
    expect(phasen).toEqual(['upload', 'konvertierung', 'einlesen'])
    expect(o.warten).toHaveBeenCalledWith(20_000)
    expect(o.hochladen).toHaveBeenCalledWith('https://s3/put', datei, expect.any(Function), undefined)
    expect(aufrufe).toContain('DELETE /api/nwd/J1')
  })

  it('Fehler der Konvertierung → Meldung des Servers, Aufräumen', async () => {
    const { fetchFn, aufrufe } = bau([{ status: 'konvertierung' }, { status: 'fehler', fehler: 'Autodesk kann die Datei nicht umwandeln. Ein Export als IFC oder OBJ ist schneller.' }])
    const r = await konvertiereNwd(datei, optionen(fetchFn))
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.meldung).toContain('IFC oder OBJ')
    expect(aufrufe).toContain('DELETE /api/nwd/J1')
  })

  it('10-Minuten-Grenze: bricht mit ehrlicher Meldung ab', async () => {
    let t = 0
    const { fetchFn } = bau(Array.from({ length: 100 }, () => ({ status: 'konvertierung' })))
    const o = optionen(fetchFn, { jetzt: () => t, warten: vi.fn(async (ms: number) => { t += ms }) })
    const r = await konvertiereNwd(datei, o)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toMatch(/10 Minuten/)
  })

  it('Server lehnt ab (Rate-Limit) → Meldung kommt durch, nichts wird hochgeladen', async () => {
    const fetchFn = vi.fn(async () => ant({ success: false, error: 'Bitte kurz warten' }, 429)) as unknown as typeof fetch
    const o = optionen(fetchFn)
    const r = await konvertiereNwd(datei, o)
    expect(r).toEqual({ ok: false, meldung: 'Bitte kurz warten' })
    expect(o.hochladen).not.toHaveBeenCalled()
  })

  it('Upload scheitert → Hinweis auf IFC/OBJ', async () => {
    const { fetchFn } = bau([])
    const o = optionen(fetchFn, { hochladen: vi.fn(async () => { throw new Error('Netzwerkfehler') }) })
    const r = await konvertiereNwd(datei, o)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toMatch(/Upload[\s\S]*fehlgeschlagen[\s\S]*IFC oder OBJ/)
  })
})

describe('leseNwdErgebnis', () => {
  it('defektes OBJ ohne Flächen → Hinweis statt Import', async () => {
    const r = await leseNwdErgebnis('obj', new TextEncoder().encode('# leer\n').buffer as ArrayBuffer)
    expect(r.ok).toBe(false)
  })
  it('defektes glTF → Hinweis', async () => {
    const r = await leseNwdErgebnis('gltf', new TextEncoder().encode('{kaputt').buffer as ArrayBuffer)
    expect(r.ok).toBe(false)
  })
})
