import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }))

const P = '11111111-1111-4111-8111-111111111111'
const C = '22222222-2222-4222-8222-222222222222'
const K1 = '33333333-3333-4333-8333-333333333333'
const K2 = '44444444-4444-4444-8444-444444444444'
let queue: ((url: string, init?: RequestInit) => { status?: number; body: unknown })[]
const calls: { url: string; init?: RequestInit }[] = []
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
  calls.length = 0; queue = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init }); const f = queue.shift(); if (!f) throw new Error('unerwartet ' + url)
    const r = f(url, init); const status = r.status ?? 200
    return { ok: status < 400, status, json: async () => r.body, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) }
  }))
})

describe('sperreFuerExterneVerwendung', () => {
  it('ohne Kundenprojekt passiert nichts und es gibt keinen Aufruf', async () => {
    const { sperreFuerExterneVerwendung } = await import('../projektnummer-sperre')
    expect(await sperreFuerExterneVerwendung({ projectId: null, typ: 'angebot' })).toBe(0)
    expect(await sperreFuerExterneVerwendung({ projectId: 'kein-uuid', typ: 'angebot' })).toBe(0)
    expect(calls.length).toBe(0)
  })
  it('ruft die Datenbankfunktion mit Typ, Dokument und Benutzer auf', async () => {
    const { sperreFuerExterneVerwendung } = await import('../projektnummer-sperre')
    queue = [() => ({ body: 1 })]
    expect(await sperreFuerExterneVerwendung({ projectId: P, typ: 'rechnung', dokumentId: 'RE-2026-0001', userId: 'u1' })).toBe(1)
    expect(calls[0].url).toContain('/rpc/cad_projektnummer_extern_verwenden')
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ p_project_id: P, p_typ: 'rechnung', p_dokument_id: 'RE-2026-0001', p_user: 'u1' })
  })
  it('Fehler der Datenbank: SperreFehler (fail-closed)', async () => {
    const { sperreFuerExterneVerwendung, SperreFehler } = await import('../projektnummer-sperre')
    queue = [() => ({ status: 500, body: 'boom' })]
    await expect(sperreFuerExterneVerwendung({ projectId: P, typ: 'angebot' })).rejects.toBeInstanceOf(SperreFehler)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('netz') }))
    await expect(sperreFuerExterneVerwendung({ projectId: P, typ: 'angebot' })).rejects.toBeInstanceOf(SperreFehler)
  })
  it('Funktion noch nicht angelegt (SQL fehlt): kein Abbruch', async () => {
    const { sperreFuerExterneVerwendung } = await import('../projektnummer-sperre')
    queue = [() => ({ status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.cad_projektnummer_extern_verwenden' } })]
    expect(await sperreFuerExterneVerwendung({ projectId: P, typ: 'angebot' })).toBe(0)
  })
})

describe('Reihenfolge: gesperrt wird VOR dem Versand bzw. der Bereitstellung', () => {
  const nach = (datei: string, sperre: string, danach: string) => {
    const t = readFileSync(datei, 'utf8'); const a = t.indexOf(sperre), b = t.indexOf(danach)
    expect(a, `${datei}: Sperre fehlt`).toBeGreaterThan(-1); expect(b, `${datei}: ${danach} fehlt`).toBeGreaterThan(-1); expect(a).toBeLessThan(b)
  }
  it('E-Mail: vor Angebots-Link und vor dem Versand', () => {
    nach('app/api/email/route.ts', 'sperreFuerExterneVerwendung({', 'sichereAngebotToken(projectId)')
    nach('app/api/email/route.ts', 'sperreFuerExterneVerwendung({', 'resend.emails.send')
  })
  it('Angebots-Link, Auftragsstand-Link, Rechnungs-Prüflink', () => {
    nach('app/api/access-token/route.ts', 'sperreFuerExterneVerwendung({', 'await sichereAngebotToken(id)')
    nach('app/api/auftrag-link/route.ts', 'sperreFuerExterneVerwendung({', 'rest/v1/project_stand_links`, {\n      method: \'POST\'')
    nach('app/api/invoices/pruef-link/route.ts', 'sperreFuerExterneVerwendung({', 'rest/v1/invoice_pruef_links`, {\n      method: \'POST\'')
  })
})

describe('Korrekturprozess und Verknüpfung', () => {
  it('ohne Begründung (unter 10 Zeichen) keine Datenbankabfrage', async () => {
    const { korrigiereProjektnummer } = await import('../projekte-server')
    await expect(korrigiereProjektnummer(C, 'P-200', 'kurz', 'u1')).rejects.toMatchObject({ status: 400 })
    expect(calls.length).toBe(0)
  })
  it('ungültige neue Nummer wird abgelehnt', async () => {
    const { korrigiereProjektnummer } = await import('../projekte-server')
    await expect(korrigiereProjektnummer(C, 'a b', 'Tippfehler auf dem Angebot', 'u1')).rejects.toMatchObject({ status: 400 })
  })
  it('Aufruf der Korrektur-Funktion mit Begründung und Benutzer; Datenbankfehler werden lesbar', async () => {
    const { korrigiereProjektnummer } = await import('../projekte-server')
    queue = [() => ({ body: '"P-200"' })]
    expect(await korrigiereProjektnummer(C, ' P-200 ', '  Tippfehler im Altsystem  ', 'u1')).toBe('P-200')
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ p_cad_projekt_id: C, p_neu: 'P-200', p_grund: 'Tippfehler im Altsystem', p_user: 'u1' })
    queue = [() => ({ status: 400, body: '{"message":"nicht_gesperrt: Die Projektnummer ist nicht gesperrt"}' })]
    await expect(korrigiereProjektnummer(C, 'P-200', 'Tippfehler im Altsystem', 'u1')).rejects.toMatchObject({ status: 409 })
    queue = [() => ({ status: 409, body: '{"message":"duplicate key value violates unique constraint \\"cad_projekte_projektnummer_uq\\""}' })]
    await expect(korrigiereProjektnummer(C, 'P-200', 'Tippfehler im Altsystem', 'u1')).rejects.toMatchObject({ status: 409, message: 'Diese Projektnummer ist schon vergeben.' })
  })
  it('dbFehler übersetzt die Regeln der Datenbank', async () => {
    const { dbFehler } = await import('../projekte-server')
    expect(dbFehler(new Error('projektnummer_gesperrt: x'))).toMatchObject({ status: 409 })
    expect(dbFehler(new Error('projekt_gesperrt_loeschen: x'))).toMatchObject({ status: 409 })
    expect(dbFehler(new Error('sperre_nicht_aufhebbar: x'))).toMatchObject({ status: 409 })
    const anderes = new Error('irgendwas'); expect(dbFehler(anderes)).toBe(anderes)
  })
  it('Verknüpfung: anderer Kunde wird abgelehnt, gesperrte Nummer ändert die Verknüpfung nicht', async () => {
    const { verknuepfeKundenprojekt } = await import('../projekte-server')
    queue = [() => ({ body: [{ project_id: null, customer_id: K1, projektnummer_gesperrt_am: null }] }), () => ({ body: [{ id: P, customer_id: K2 }] })]
    await expect(verknuepfeKundenprojekt(C, P, 'u1')).rejects.toMatchObject({ status: 409 })
    const ANDERES = '55555555-5555-4555-8555-555555555555'
    queue = [() => ({ body: [{ project_id: ANDERES, customer_id: null, projektnummer_gesperrt_am: '2026-11-22T10:00:00Z' }] }), () => ({ body: [{ id: P, customer_id: null }] })]
    await expect(verknuepfeKundenprojekt(C, P, 'u1')).rejects.toMatchObject({ status: 409 })
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(false)
  })
  it('Verknüpfung übernimmt den Kunden des Kundenprojekts, wenn das CAD-Projekt noch keinen hat', async () => {
    const { verknuepfeKundenprojekt } = await import('../projekte-server')
    queue = [() => ({ body: [{ project_id: null, customer_id: null, projektnummer_gesperrt_am: null }] }), () => ({ body: [{ id: P, customer_id: K1 }] }), () => ({ body: [{ id: C }] })]
    await verknuepfeKundenprojekt(C, P, 'u1')
    expect(JSON.parse(String(calls.find((c) => c.init?.method === 'PATCH')!.init!.body))).toMatchObject({ project_id: P, customer_id: K1 })
  })
})
