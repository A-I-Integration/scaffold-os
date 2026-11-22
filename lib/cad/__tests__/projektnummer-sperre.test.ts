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
  const EV = '66666666-6666-4666-8666-666666666666'
  it('ohne Projektnummer im Dokument oder ohne Kundenprojekt passiert nichts und es gibt keinen Aufruf', async () => {
    const { sperreFuerExterneVerwendung } = await import('../projektnummer-sperre')
    expect(await sperreFuerExterneVerwendung({ projectId: P, typ: 'angebot' })).toBeNull()
    expect(await sperreFuerExterneVerwendung({ projectId: P, typ: 'angebot', projektnummer: '  ' })).toBeNull()
    expect(await sperreFuerExterneVerwendung({ projectId: null, typ: 'angebot', projektnummer: 'P-1' })).toBeNull()
    expect(await sperreFuerExterneVerwendung({ projectId: 'kein-uuid', typ: 'angebot', projektnummer: 'P-1' })).toBeNull()
    expect(calls.length).toBe(0)
  })
  it('ruft die Datenbankfunktion mit Typ, Dokument, Benutzer und der gedruckten Nummer auf und gibt die Ereignis-ID zurück', async () => {
    const { sperreFuerExterneVerwendung } = await import('../projektnummer-sperre')
    queue = [() => ({ body: EV })]
    expect(await sperreFuerExterneVerwendung({ projectId: P, typ: 'rechnung', dokumentId: 'RE-2026-0001', userId: 'u1', projektnummer: ' P-100 ' })).toBe(EV)
    expect(calls[0].url).toContain('/rpc/cad_projektnummer_extern_verwenden')
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ p_project_id: P, p_typ: 'rechnung', p_dokument_id: 'RE-2026-0001', p_user: 'u1', p_projektnummer: 'P-100' })
  })
  it('Fehler der Datenbank: SperreFehler 503 (fail-closed)', async () => {
    const { sperreFuerExterneVerwendung, SperreFehler } = await import('../projektnummer-sperre')
    queue = [() => ({ status: 500, body: 'boom' })]
    await expect(sperreFuerExterneVerwendung({ projectId: P, typ: 'angebot', projektnummer: 'P-1' })).rejects.toMatchObject({ status: 503 })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('netz') }))
    await expect(sperreFuerExterneVerwendung({ projectId: P, typ: 'angebot', projektnummer: 'P-1' })).rejects.toBeInstanceOf(SperreFehler)
  })
  it('Nummer im Dokument stimmt nicht mehr mit dem Projekt überein: 409, nichts wird versendet', async () => {
    const { sperreFuerExterneVerwendung } = await import('../projektnummer-sperre')
    queue = [() => ({ status: 400, body: '{"message":"projektnummer_abweichend: x"}' })]
    await expect(sperreFuerExterneVerwendung({ projectId: P, typ: 'angebot', projektnummer: 'P-ALT' })).rejects.toMatchObject({ status: 409 })
  })
  it('Funktion noch nicht angelegt (SQL fehlt): kein Abbruch', async () => {
    const { sperreFuerExterneVerwendung } = await import('../projektnummer-sperre')
    queue = [() => ({ status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.cad_projektnummer_extern_verwenden' } })]
    expect(await sperreFuerExterneVerwendung({ projectId: P, typ: 'angebot', projektnummer: 'P-1' })).toBeNull()
  })
  it('Fehlversand wird als eigenes Ereignis gemeldet und wirft nie', async () => {
    const { markiereVersandFehler } = await import('../projektnummer-sperre')
    queue = [() => ({ body: EV })]
    await markiereVersandFehler(EV, 'Resend: Postfach voll')
    expect(calls[0].url).toContain('/rpc/cad_projektnummer_versand_fehlgeschlagen')
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ p_ereignis_id: EV, p_fehler: 'Resend: Postfach voll' })
    calls.length = 0
    await markiereVersandFehler(null, 'x'); await markiereVersandFehler('kein-uuid', 'x')
    expect(calls.length).toBe(0)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('netz') }))
    await expect(markiereVersandFehler(EV, 'x')).resolves.toBeUndefined()
  })
  it('Projektnummern nur bei genau einem verknüpften CAD-Projekt (sonst nicht eindeutig)', async () => {
    const { projektnummernZuProjekten, ergaenzeProjektnummer } = await import('../projektnummer-sperre')
    const P2 = '77777777-7777-4777-8777-777777777777'
    queue = [() => ({ body: [{ project_id: P, projektnummer: 'P-100' }, { project_id: P2, projektnummer: 'P-200' }, { project_id: P2, projektnummer: 'P-201' }] })]
    const m = await projektnummernZuProjekten([P, P2, null])
    expect(m.get(P)).toBe('P-100'); expect(m.has(P2)).toBe(false)
    queue = [() => ({ body: [{ project_id: P, projektnummer: 'P-100' }] })]
    expect(await ergaenzeProjektnummer([{ project_id: P }, { project_id: null }])).toEqual([{ project_id: P, projektnummer: 'P-100' }, { project_id: null, projektnummer: null }])
  })
  it('viele Projekte: Abfrage in Gruppen, Adresse bleibt kurz', async () => {
    const { projektnummernZuProjekten } = await import('../projektnummer-sperre')
    const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    queue = [() => ({ body: [] }), () => ({ body: [] }), () => ({ body: [] })]
    await projektnummernZuProjekten(ids)
    expect(calls.length).toBe(3)
    expect(Math.max(...calls.map((c) => c.url.length))).toBeLessThan(4000)
  })
})

describe('Sperre nur bei tatsächlicher Verwendung im Dokument, VOR dem Versand', () => {
  const quelle = (d: string) => readFileSync(d, 'utf8')
  const nach = (datei: string, sperre: string, danach: string) => {
    const t = quelle(datei); const a = t.indexOf(sperre), b = t.indexOf(danach)
    expect(a, `${datei}: Sperre fehlt`).toBeGreaterThan(-1); expect(b, `${datei}: ${danach} fehlt`).toBeGreaterThan(-1); expect(a).toBeLessThan(b)
  }
  it('E-Mail: Sperre vor Angebots-Link und Versand, mit der gedruckten Nummer; Fehlversand wird markiert', () => {
    nach('app/api/email/route.ts', 'sperreFuerExterneVerwendung({', 'sichereAngebotToken(projectId)')
    nach('app/api/email/route.ts', 'sperreFuerExterneVerwendung({', 'resend.emails.send')
    const t = quelle('app/api/email/route.ts')
    expect(t).toContain('projektnummer: nummerImDokument'); expect(t).toContain('markiereVersandFehler(ereignisId')
  })
  it('Kunden-Mail mit Rechnung: Sperre vor dem Versand, nur mit Anhang und Nummer', () => {
    nach('app/api/kunden/[id]/mail/route.ts', 'sperreFuerExterneVerwendung({', 'resend.emails.send')
    expect(quelle('app/api/kunden/[id]/mail/route.ts')).toContain('invoiceNumber && pdfBase64 &&')
  })
  it('Mahnversand (Cron und Knopf): Nummer wird gedruckt, Sperre vor dem Versand, Fehlversand markiert', () => {
    nach('lib/mahnung-versand.ts', 'projektnummerZuProjekt(inv.project_id)', 'generateMahnungPDF(inv')
    nach('lib/mahnung-versand.ts', 'sperreFuerExterneVerwendung({', 'emails.send')
    expect(quelle('lib/mahnung-versand.ts')).toContain('markiereVersandFehler(ereignisId')
  })
  it('Link-Routen sperren nicht (ihre Seiten zeigen die Projektnummer nicht)', () => {
    for (const d of ['app/api/access-token/route.ts', 'app/api/auftrag-link/route.ts', 'app/api/invoices/pruef-link/route.ts']) expect(quelle(d), d).not.toContain('sperreFuerExterneVerwendung')
  })
  it('Vorschau und PDF-Export sperren nie: nur die Versandrouten rufen die Sperre auf', () => {
    for (const d of ['app/aufmass/schritt6/page.tsx', 'app/rechnungen/page.tsx', 'lib/invoice-pdf.ts', 'app/api/invoices/zugferd/route.ts']) expect(quelle(d), d).not.toContain('sperreFuerExterneVerwendung')
  })
  it('Alle Versandstellen melden die gedruckte Projektnummer', () => {
    for (const d of ['app/kunden/[id]/page.tsx', 'app/kunden/page.tsx', 'app/rechnungen/[id]/page.tsx', 'app/rechnungen/page.tsx', 'components/KundeAuftrag.tsx', 'components/NeueMailDialog.tsx', 'app/aufmass/schritt6/page.tsx']) expect(quelle(d), d).toMatch(/projektnummer/)
  })
  it('Dokumente drucken die Projektnummer', () => {
    const t = quelle('lib/invoice-pdf.ts')
    expect((t.match(/zeichneProjektnummer\(doc, inv\.projektnummer\)/g) || []).length).toBe(3)
    expect(quelle('lib/invoice-pdf-server.ts')).toContain('Projektnummer:')
    expect(quelle('app/aufmass/schritt6/page.tsx')).toContain('zeichneProjektnummer(doc, projektnummer)')
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
    queue = [() => ({ body: [{ project_id: null, customer_id: K1, projektnummer_gesperrt_am: null }] }), () => ({ body: [{ id: P, customer_id: K2 }] }), () => ({ body: [] })]
    await expect(verknuepfeKundenprojekt(C, P, 'u1')).rejects.toMatchObject({ status: 409 })
    const ANDERES = '55555555-5555-4555-8555-555555555555'
    queue = [() => ({ body: [{ project_id: ANDERES, customer_id: null, projektnummer_gesperrt_am: '2026-11-22T10:00:00Z' }] }), () => ({ body: [{ id: P, customer_id: null }] }), () => ({ body: [] })]
    await expect(verknuepfeKundenprojekt(C, P, 'u1')).rejects.toMatchObject({ status: 409 })
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(false)
  })
  it('Verknüpfung übernimmt den Kunden des Kundenprojekts, wenn das CAD-Projekt noch keinen hat', async () => {
    const { verknuepfeKundenprojekt } = await import('../projekte-server')
    queue = [() => ({ body: [{ project_id: null, customer_id: null, projektnummer_gesperrt_am: null }] }), () => ({ body: [{ id: P, customer_id: K1 }] }), () => ({ body: [] }), () => ({ body: [{ id: C }] })]
    await verknuepfeKundenprojekt(C, P, 'u1')
    expect(JSON.parse(String(calls.find((c) => c.init?.method === 'PATCH')!.init!.body))).toMatchObject({ project_id: P, customer_id: K1 })
  })
  it('Verknüpfung: ein Kundenprojekt gehört zu höchstens einem CAD-Projekt', async () => {
    const { verknuepfeKundenprojekt } = await import('../projekte-server')
    queue = [() => ({ body: [{ project_id: null, customer_id: null, projektnummer_gesperrt_am: null }] }), () => ({ body: [{ id: P, customer_id: null }] }), () => ({ body: [{ id: K2, name: 'Altes CAD' }] })]
    await expect(verknuepfeKundenprojekt(C, P, 'u1')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Altes CAD') })
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(false)
  })
  it('Kundenprojekt-Liste markiert bereits verknüpfte und fügt nichts automatisch zusammen', async () => {
    const { listeKundenprojekte } = await import('../projekte-server')
    queue = [() => ({ body: [{ id: P, name: 'A', adresse: null, customer_id: K1, customer: { name: 'Kunde' } }, { id: K2, name: 'B', adresse: 'x', customer_id: null, customer: null }] }), () => ({ body: [{ project_id: P }] })]
    expect(await listeKundenprojekte()).toEqual([{ id: P, name: 'A', adresse: null, customer_id: K1, kunde: 'Kunde', verknuepft: true }, { id: K2, name: 'B', adresse: 'x', customer_id: null, kunde: null, verknuepft: false }])
    expect(calls.every((c) => !c.init?.method || c.init.method === 'GET')).toBe(true)
  })
})
