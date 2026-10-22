import { describe, it, expect, vi } from 'vitest'
import { speicherImArbeitsspeicher, merkeModell, ladeGemerktesModell, vergissModell, nwdZwischenspeicher, dateiHash, NWD_CACHE_MAX_EINTRAEGE, type GemerktesModell } from '../modell-speicher'
import { konvertiereNwd } from '../nwd-client'

const ant = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const OBJ = 'v 0 0 0\nv 10 0 0\nv 0 5 0\nf 1 2 3\n'
const modell = (): GemerktesModell => ({ name: 'turm.nwd', format: 'obj', quader: { groesse: { x: 1, y: 2, z: 3 }, punkte: 3 }, dreiecke: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), einheit: 'm', oben: 'z', einheitGeschaetzt: true, quelle: 'nwd' })

describe('aktuelles Modell', () => {
  it('bleibt erhalten, bis es verworfen wird', async () => {
    const sp = speicherImArbeitsspeicher()
    expect(await ladeGemerktesModell(sp)).toBeNull()
    expect(await merkeModell(modell(), sp)).toBe(true)
    const g = await ladeGemerktesModell(sp)
    expect(g?.name).toBe('turm.nwd')
    expect(g?.dreiecke.length).toBe(9)
    await vergissModell(sp)
    expect(await ladeGemerktesModell(sp)).toBeNull()
  })
  it('ohne Speicher oder mit kaputtem Eintrag: kein Fehler', async () => {
    expect(await merkeModell(modell(), null)).toBe(false)
    expect(await ladeGemerktesModell(null)).toBeNull()
    const sp = speicherImArbeitsspeicher()
    await sp.setzen('aktuell', 'modell', { name: 'x' })
    expect(await ladeGemerktesModell(sp)).toBeNull()
    const kaputt = { ...sp, setzen: async () => { throw new Error('voll') } }
    expect(await merkeModell(modell(), kaputt)).toBe(false)
  })
})

describe('Ergebnis-Zwischenspeicher je NWD', () => {
  it('Hash hängt nur vom Inhalt ab, nicht vom Namen', async () => {
    const a = await dateiHash(new File([new Uint8Array([1, 2, 3])], 'a.nwd'))
    const b = await dateiHash(new File([new Uint8Array([1, 2, 3])], 'b.nwd'))
    const c = await dateiHash(new File([new Uint8Array([1, 2, 4])], 'a.nwd'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
  it('hält höchstens so viele Einträge, wirft die ältesten raus', async () => {
    const z = nwdZwischenspeicher(speicherImArbeitsspeicher())!
    vi.useFakeTimers()
    for (let i = 0; i < NWD_CACHE_MAX_EINTRAEGE + 3; i++) { vi.setSystemTime(1000 + i); await z.speichere('h' + i, { format: 'obj', dreiecke: new Float32Array(9) }) }
    vi.useRealTimers()
    expect(await z.hole('h0')).toBeNull()
    expect(await z.hole('h2')).toBeNull()
    expect(await z.hole('h3')).not.toBeNull()
    expect(await z.hole('h' + (NWD_CACHE_MAX_EINTRAEGE + 2))).not.toBeNull()
  })
  it('dieselbe NWD wird nur einmal bei Autodesk übersetzt', async () => {
    const datei = new File([new Uint8Array(1000).fill(7)], 'haus.nwd')
    const z = nwdZwischenspeicher(speicherImArbeitsspeicher())!
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url), m = init?.method ?? 'GET'
      if (u === '/api/nwd' && m === 'POST') return ant({ success: true, id: 'J1', uploadUrl: 'https://s3/put', uploadKey: 'K' })
      if (u === '/api/nwd/J1' && m === 'POST') return ant({ status: 'fertig', format: 'obj', ergebnisUrl: 'https://ergebnis/obj' })
      if (u === '/api/nwd/J1' && m === 'DELETE') return ant({ success: true })
      if (u === 'https://ergebnis/obj') return new Response(OBJ)
      return ant({}, 404)
    }) as unknown as typeof fetch
    const hochladen = vi.fn(async () => undefined)
    const o = { fetchFn, hochladen, warten: async () => undefined, zwischenspeicher: z }
    const r1 = await konvertiereNwd(datei, o)
    expect(r1.ok && !r1.ausZwischenspeicher).toBe(true)
    expect(hochladen).toHaveBeenCalledTimes(1)
    const aufrufeNach1 = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    const r2 = await konvertiereNwd(new File([new Uint8Array(1000).fill(7)], 'umbenannt.nwd'), o)
    expect(r2.ok && r2.ausZwischenspeicher).toBe(true)
    if (r2.ok) expect(r2.dreiecke.length).toBe(9)
    expect(hochladen).toHaveBeenCalledTimes(1)
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(aufrufeNach1)
  })
  it('fehlgeschlagene Umwandlung wird nicht gemerkt', async () => {
    const z = nwdZwischenspeicher(speicherImArbeitsspeicher())!
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url), m = init?.method ?? 'GET'
      if (u === '/api/nwd' && m === 'POST') return ant({ success: true, id: 'J1', uploadUrl: 'x', uploadKey: 'K' })
      if (u === '/api/nwd/J1' && m === 'POST') return ant({ status: 'fehler', fehler: 'Kontingent' })
      return ant({ success: true })
    }) as unknown as typeof fetch
    const datei = new File([new Uint8Array(10)], 'a.nwd')
    const r = await konvertiereNwd(datei, { fetchFn, hochladen: async () => undefined, warten: async () => undefined, zwischenspeicher: z })
    expect(r.ok).toBe(false)
    expect(await z.hole((await dateiHash(datei))!)).toBeNull()
  })
})
