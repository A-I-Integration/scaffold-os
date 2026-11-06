import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Service Worker in einer nachgebauten Umgebung ausführen (ohne Browser): Cache-Speicher, fetch und Ereignisse sind Attrappen.
type Handler = (e: unknown) => void
function baue(netz: (url: string) => Response | Promise<Response>) {
  const handler: Record<string, Handler> = {}
  const speicher = new Map<string, Map<string, Response>>()
  const holeCache = (n: string) => { if (!speicher.has(n)) speicher.set(n, new Map()); return speicher.get(n)! }
  const schluessel = (r: Request | string) => { const u = new URL(typeof r === 'string' ? r : r.url, 'https://app.test'); return u.pathname + (u.search || '') }
  const caches = {
    open: async (n: string) => ({
      match: async (r: Request | string) => holeCache(n).get(schluessel(r))?.clone(),
      put: async (r: Request | string, res: Response) => { holeCache(n).set(schluessel(r), res) },
      add: async (r: string) => { holeCache(n).set(schluessel(r), await netz('https://app.test' + r)) },
    }),
    match: async (r: Request | string) => { for (const c of speicher.values()) { const t = c.get(schluessel(r)); if (t) return t.clone() } return undefined },
    keys: async () => [...speicher.keys()],
    delete: async (n: string) => speicher.delete(n),
  }
  let zaehler = 0
  const abrufe: string[] = []
  const self = {
    location: { origin: 'https://app.test' }, addEventListener: (t: string, h: Handler) => { handler[t] = h },
    skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() },
  }
  const fetchAttrappe = async (r: Request | string) => { const url = typeof r === 'string' ? r : r.url; abrufe.push(url); zaehler++; return netz(url) }
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch: fetchAttrappe, URL, Response, Promise, Set, Array, setTimeout, clearTimeout, Error })
  const anfrage = async (pfad: string, o: { navigate?: boolean; method?: string } = {}) => {
    let antwort: Promise<Response> | null = null
    const req = Object.assign(new Request('https://app.test' + pfad, { method: o.method ?? 'GET' }), {}) as Request
    Object.defineProperty(req, 'mode', { value: o.navigate ? 'navigate' : 'cors' })
    handler.fetch({ request: req, respondWith: (p: Promise<Response>) => { antwort = p } })
    if (!antwort) return null
    return antwort as Promise<Response>
  }
  const installiere = async () => { let p: Promise<unknown> = Promise.resolve(); handler.install({ waitUntil: (x: Promise<unknown>) => { p = x } }); await p }
  return { handler, speicher, abrufe, anfrage, installiere, zaehler: () => zaehler }
}
// Im Browser sind gleiche-Herkunft-Antworten vom Typ „basic“; ein selbst gebautes Response hat „default“
const basic = (r: Response, redirected = false): Response => { Object.defineProperty(r, 'type', { value: 'basic' }); Object.defineProperty(r, 'redirected', { value: redirected }); return r }
const html = (t: string) => basic(new Response(t, { status: 200, headers: { 'content-type': 'text/html' } }))
const warten = (ms = 100) => new Promise((r) => setTimeout(r, ms))

describe('Service Worker – Regeln', () => {
  let online = true
  const netz = (url: string): Response | Promise<Response> => {
    if (!online) return Promise.reject(new Error('offline'))
    const p = new URL(url, 'https://app.test').pathname
    if (p === '/offline.html') return html('OFFLINE-SEITE')
    if (p.startsWith('/_next/static/')) return new Response('js-' + p, { status: 200 })
    if (p === '/cad') return html('<html><script src="/_next/static/chunks/cad-abc.js"></script><link href="/_next/static/css/x.css"></html>')
    return html('Seite ' + p)
  }
  beforeEach(() => { online = true })

  it('Installieren legt die Offline-Seite ab', async () => {
    const w = baue(netz); await w.installiere()
    expect([...w.speicher.values()].some((c) => c.has('/offline.html'))).toBe(true)
  })
  it('API, Anmeldung und Überwachung gehen nie durch den Worker; POST auch nicht', async () => {
    const w = baue(netz)
    for (const p of ['/api/invoices', '/api/email', '/login', '/auth/callback', '/monitoring', '/statiker']) expect(await w.anfrage(p, { navigate: !p.startsWith('/api/') })).toBeNull()
    expect(await w.anfrage('/cad', { navigate: true, method: 'POST' })).toBeNull()
  })
  it('CAD-Seite: online geladen und abgelegt; offline kommt die Kopie; Skriptdateien der Seite sind danach auch offline da', async () => {
    const w = baue(netz); await w.installiere()
    const a = await (await w.anfrage('/cad', { navigate: true }))!
    expect(await a.text()).toContain('cad-abc.js')
    await warten()
    online = false
    const b = await (await w.anfrage('/cad', { navigate: true }))!
    expect(await b.text()).toContain('cad-abc.js')
    const js = await (await w.anfrage('/_next/static/chunks/cad-abc.js'))!
    expect(await js.text()).toBe('js-/_next/static/chunks/cad-abc.js')
  })
  it('Nie besuchte erlaubte Seite offline: Offline-Seite statt Fehler', async () => {
    const w = baue(netz); await w.installiere(); online = false
    const r = await (await w.anfrage('/aufmass/schritt3', { navigate: true }))!
    expect(await r.text()).toBe('OFFLINE-SEITE')
  })
  it('Nicht freigegebene Bereiche (Rechnungen) werden nicht abgefangen', async () => {
    const w = baue(netz)
    expect(await w.anfrage('/rechnungen', { navigate: true })).toBeNull()
  })
  it('Umleitungen und Fehlerseiten werden nicht abgelegt', async () => {
    const w = baue((u) => (new URL(u, 'https://app.test').pathname === '/cad' ? basic(new Response('nope', { status: 500 })) : html('x')))
    await (await w.anfrage('/cad', { navigate: true }))!
    await warten()
    expect([...w.speicher.values()].some((c) => c.has('/cad'))).toBe(false)
    const w2 = baue(() => basic(new Response('Anmeldeseite', { status: 200 }), true))   // Umleitung auf /login
    await (await w2.anfrage('/cad', { navigate: true }))!
    await warten()
    expect([...w2.speicher.values()].some((c) => c.has('/cad'))).toBe(false)
  })
  it('Abmelden: Nachricht löscht alle Kopien', async () => {
    const w = baue(netz); await w.installiere(); await (await w.anfrage('/cad', { navigate: true }))!; await warten()
    expect(w.speicher.size).toBeGreaterThan(0)
    let p: Promise<unknown> = Promise.resolve()
    w.handler.message({ data: { typ: 'cache-leeren' }, waitUntil: (x: Promise<unknown>) => { p = x } }); await p
    expect(w.speicher.size).toBe(0)
  })
  it('Statische Dateien kommen nach dem ersten Laden aus dem Speicher', async () => {
    const w = baue(netz)
    await (await w.anfrage('/draco/draco_decoder.wasm'))!
    const n = w.abrufe.length
    await (await w.anfrage('/draco/draco_decoder.wasm'))!
    expect(w.abrufe.length).toBe(n)
  })

  it('Stufe 2: Kundenliste online geladen → offline kommt die letzte Kopie mit Hinweis-Kopfzeile', async () => {
    const json = (t: unknown) => basic(new Response(JSON.stringify(t), { status: 200, headers: { 'content-type': 'application/json' } }))
    const w = baue((u) => (new URL(u, 'https://app.test').pathname === '/api/kunden' ? (online ? json({ success: true, kunden: [{ id: 1 }] }) : Promise.reject(new Error('offline'))) : html('x')))
    const a = await (await w.anfrage('/api/kunden'))!
    expect((await a.json()).kunden).toHaveLength(1)
    expect(a.headers.get('x-offline-kopie')).toBeNull()
    online = false
    const b = await (await w.anfrage('/api/kunden'))!
    expect(b.headers.get('x-offline-kopie')).toBe('1')
    expect((await b.json()).kunden[0].id).toBe(1)
  })
  it('Stufe 2: Projekt nach ID wird je Adresse einzeln abgelegt; unbekannte Adresse offline = Fehler (kein erfundenes Ergebnis)', async () => {
    const json = (t: unknown) => basic(new Response(JSON.stringify(t), { status: 200, headers: { 'content-type': 'application/json' } }))
    const w = baue((u) => (online ? json({ url: u }) : Promise.reject(new Error('offline'))))
    await (await w.anfrage('/api/projects?id=7'))!
    online = false
    const ok = await (await w.anfrage('/api/projects?id=7'))!
    expect((await ok.json()).url).toContain('id=7')
    await expect(w.anfrage('/api/projects?id=8')).rejects.toBeTruthy()
  })
  it('Stufe 2: Fehlerantworten (401, 500) und Nicht-JSON werden nicht als Kopie abgelegt; Schreibzugriffe gehen nie durch', async () => {
    const w = baue(() => basic(new Response('<html>Login</html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    await (await w.anfrage('/api/kunden'))!
    const w2 = baue(() => basic(new Response('{"error":"x"}', { status: 401, headers: { 'content-type': 'application/json' } })))
    await (await w2.anfrage('/api/kunden'))!
    for (const x of [w, w2]) expect([...x.speicher.values()].some((c) => c.has('/api/kunden'))).toBe(false)
    expect(await w.anfrage('/api/kunden', { method: 'POST' })).toBeNull()
  })
})
