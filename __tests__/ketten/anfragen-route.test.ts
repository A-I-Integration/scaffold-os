import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { baueFakeRest, type Tabellen } from './fake-rest'

// Kettentest Externe Anfragen (Kundenportal): Einreichen per Zugangslink, Dateiprüfung, Mail-Ausfall,
// interne Verwaltung, Übernahme A/B/C mit Schutz vor Doppelübernahme und Rückabwicklung – über die ECHTEN Routen.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.RESEND_API_KEY = 're_test'
const ctx = vi.hoisted(() => ({ rolle: 'admin', uid: 'u1', mailFehler: false, mails: [] as { subject: string; to: string[] }[] }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: ctx.uid } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: ctx.rolle } }) }) }) }),
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ oeffentlichRateLimitPruefen: () => ({ ok: true }), kiRateLimitPruefen: async () => ({ ok: true }) }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: async (m: { subject: string; to: string[] }) => { if (ctx.mailFehler) return { error: { message: 'Resend kaputt' } }; ctx.mails.push(m); return { error: null } } } },
}))

const TOKEN = 'a'.repeat(48)
const PDF = new TextEncoder().encode('%PDF-1.7 testinhalt')
const EXE = new TextEncoder().encode('MZ-keine-pdf-datei')
let db: Tabellen
let speicher: Map<string, Uint8Array>
let kaputt: { projects: boolean }

beforeEach(() => {
  ctx.rolle = 'admin'; ctx.uid = 'u1'; ctx.mailFehler = false; ctx.mails = []; speicher = new Map(); kaputt = { projects: false }
  db = {
    anfrage_zugaenge: [{ id: 'z1', token: TOKEN, customer_id: null, expires_at: new Date(Date.now() + 86400000).toISOString(), revoked_at: null }],
    externe_anfragen: [], externe_anfragen_dateien: [], externe_anfragen_protokoll: [],
    customers: [{ id: 'c-alt', name: 'Bestand GmbH', email: 'info@bestand.de' }], projects: [], project_media: [], company_settings: [],
    profiles: [{ id: 'u1', role: 'admin', email: 'chef@firma.de', full_name: 'Chefin' }, { id: 'u2', role: 'disponent', email: 'dispo@firma.de', full_name: 'Dispo' }, { id: 'u3', role: 'mitarbeiter', email: 'ma@firma.de' }],
  }
  const rest = baueFakeRest(db)
  vi.stubGlobal('fetch', async (e: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(e)); const m = (init?.method ?? 'GET').toUpperCase()
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (u.pathname.startsWith('/storage/v1/')) {
      const pfad = u.pathname
      if (pfad.includes('/object/upload/sign/')) return json({ url: `${pfad.replace('/storage/v1', '')}?token=t` })
      if (pfad.includes('/object/sign/')) return json({ signedURL: `${pfad.replace('/storage/v1', '')}?token=dl` })
      if (pfad === '/storage/v1/object/copy') return json({ Key: 'ok' })
      const key = pfad.replace('/storage/v1/object/anfragen/', '')
      if (m === 'DELETE') { speicher.delete(key); return json({}) }
      const b = speicher.get(key)
      if (!b) return json({ error: 'not found' }, 404)
      return new Response(b.slice(0, 16), { status: 206, headers: { 'content-range': `bytes 0-${Math.min(15, b.length - 1)}/${b.length}` } })
    }
    const tabelle = u.pathname.split('/rest/v1/')[1]
    if (m === 'POST' && ['externe_anfragen', 'customers', 'projects', 'externe_anfragen_dateien', 'anfrage_zugaenge'].includes(tabelle)) {
      if (tabelle === 'projects' && kaputt.projects) return new Response('boom', { status: 500 })
      const b = JSON.parse(String(init?.body ?? '{}'))
      return rest(e, { ...init, body: JSON.stringify({ id: crypto.randomUUID(), ...b }) })
    }
    return rest(e, init)
  })
})

const req = (body: unknown, method = 'POST') => new Request('http://x/api', { method, body: JSON.stringify(body) }) as never
const get = (qs: string) => new NextRequest(`http://x/api?${qs}`) as never
const pub = async (body: Record<string, unknown>) => (await import('@/app/api/public/anfrage/route')).POST(req({ token: TOKEN, ...body }))
const FORM = { name: 'Erika Muster', firma: 'Neu Bau AG', email: 'erika@neubau.de', telefon: '', baustelle_name: 'Haus A', baustelle_adresse: 'Rue 5, L-1234 Luxembourg', land: 'Luxemburg', beschreibung: 'Fassade einrüsten' }

/** Kompletter Eingang: Formular + Dateien hochladen + abschließen. */
async function einreichen(dateien: { name: string; type: string; bytes: Uint8Array }[] = [{ name: 'plan.pdf', type: 'application/pdf', bytes: PDF }]) {
  const r1 = await pub({ aktion: 'start', ...FORM, dateien: dateien.map((d) => ({ name: d.name, type: d.type, size: d.bytes.length })) })
  const j1 = await r1.json()
  for (const up of (j1.uploads || []) as { index: number; url: string }[]) speicher.set(new URL(up.url).pathname.replace('/storage/v1/object/upload/sign/anfragen/', ''), dateien[up.index].bytes)
  return { j1, abschliessen: () => pub({ aktion: 'abschliessen', anfrage_id: j1.anfrage_id }) }
}
async function eingegangen() { const e = await einreichen(); await e.abschliessen(); return e.j1.anfrage_id as string }
const uebernahme = async (b: Record<string, unknown>) => (await import('@/app/api/anfragen/uebernahme/route')).POST(req(b))
const patch = async (b: Record<string, unknown>) => (await import('@/app/api/anfragen/route')).PATCH(req(b, 'PATCH'))

describe('Zugangslink', () => {
  it('ungültiger, abgelaufener und widerrufener Link wird abgelehnt', async () => {
    const { POST } = await import('@/app/api/public/anfrage/route')
    expect((await POST(req({ token: 'x', aktion: 'start', ...FORM }))).status).toBe(404)
    db.anfrage_zugaenge[0].expires_at = new Date(Date.now() - 1000).toISOString()
    expect((await pub({ aktion: 'start', ...FORM })).status).toBe(404)
    db.anfrage_zugaenge[0].expires_at = null; db.anfrage_zugaenge[0].revoked_at = new Date().toISOString()
    expect((await pub({ aktion: 'start', ...FORM })).status).toBe(404)
    expect(db.externe_anfragen).toHaveLength(0)
  })
})

describe('Einreichen', () => {
  it('speichert zuerst, vergibt Nummer, schreibt Verlauf, benachrichtigt Admin und Disposition genau einmal', async () => {
    const e = await einreichen()
    expect(db.externe_anfragen[0].status).toBe('entwurf') // vor dem Abschluss im Büro unsichtbar
    const j = await (await e.abschliessen()).json()
    expect(j.nummer).toMatch(/^AF-\d{4}-0001$/)
    expect(db.externe_anfragen[0].status).toBe('neu')
    expect(db.externe_anfragen_protokoll[0].aktion).toBe('eingereicht')
    expect(ctx.mails).toHaveLength(1)
    expect(ctx.mails[0].to.sort()).toEqual(['chef@firma.de', 'dispo@firma.de'])
    expect(db.externe_anfragen[0].benachrichtigt_am).toBeTruthy()
  })
  it('doppeltes Abschließen erzeugt keinen zweiten Eingang und keine zweite Mail', async () => {
    const e = await einreichen()
    const [a, b] = await Promise.all([e.abschliessen(), e.abschliessen()])
    expect((await a.json()).success && (await b.json()).success).toBe(true)
    await e.abschliessen()
    expect(db.externe_anfragen.filter((x) => x.status === 'neu')).toHaveLength(1)
    expect(db.externe_anfragen_protokoll.filter((p) => p.aktion === 'eingereicht')).toHaveLength(1)
    expect(ctx.mails).toHaveLength(1)
  })
  it('lehnt unzulässige Dateien vor dem Hochladen ab (Typ, Größe, Anzahl) und speichert nichts', async () => {
    for (const d of [{ name: 'virus.exe', type: 'application/x-msdownload', size: 10 }, { name: 'gross.pdf', type: 'application/pdf', size: 26 * 1024 * 1024 }, { name: 'leer.pdf', type: 'application/pdf', size: 0 }, { name: 'bild.pdf', type: 'image/png', size: 5 }]) {
      expect((await pub({ aktion: 'start', ...FORM, dateien: [d] })).status).toBe(400)
    }
    expect((await pub({ aktion: 'start', ...FORM, dateien: Array.from({ length: 16 }, (_, i) => ({ name: `a${i}.pdf`, type: 'application/pdf', size: 5 })) })).status).toBe(400)
    expect(db.externe_anfragen).toHaveLength(0)
  })
  it('weist nach dem Hochladen Dateien ab, deren Inhalt nicht zur Endung passt, und löscht sie', async () => {
    const e = await einreichen([{ name: 'plan.pdf', type: 'application/pdf', bytes: EXE }])
    const r = await e.abschliessen()
    expect(r.status).toBe(422)
    expect(speicher.size).toBe(0)
    expect(db.externe_anfragen[0].status).toBe('entwurf')
    expect(ctx.mails).toHaveLength(0)
  })
  it('meldet fehlende Pflichtangaben und ignoriert das Bot-Feld', async () => {
    expect((await pub({ aktion: 'start', ...FORM, name: '' })).status).toBe(400)
    expect((await pub({ aktion: 'start', ...FORM, email: 'kaputt', telefon: '' })).status).toBe(400)
    expect((await pub({ aktion: 'start', ...FORM, email: '', telefon: '' })).status).toBe(400)
    expect((await pub({ aktion: 'start', ...FORM, land: 'Atlantis<script>' })).status).toBe(400)
    const bot = await pub({ aktion: 'start', ...FORM, website: 'http://spam' })
    expect((await bot.json()).anfrage_id).toBeNull()
    expect(db.externe_anfragen).toHaveLength(0)
  })
  it('Mailausfall: Anfrage bleibt gespeichert, Fehler wird vermerkt, Wiederholung klappt', async () => {
    ctx.mailFehler = true
    const e = await einreichen()
    const j = await (await e.abschliessen()).json()
    expect(j.success).toBe(true)
    expect(db.externe_anfragen[0].status).toBe('neu')
    expect(db.externe_anfragen[0].benachrichtigung_fehler).toContain('Resend kaputt')
    expect(db.externe_anfragen[0].benachrichtigt_am).toBeFalsy()
    ctx.mailFehler = false
    const r = await patch({ id: e.j1.anfrage_id, aktion: 'benachrichtigung' })
    expect((await r.json()).success).toBe(true)
    expect(ctx.mails).toHaveLength(1)
    expect(db.externe_anfragen[0].benachrichtigung_fehler).toBeNull()
  })
})

describe('Interne Verwaltung', () => {
  it('nur Admin und Disposition', async () => {
    const { GET } = await import('@/app/api/anfragen/route')
    ctx.rolle = 'mitarbeiter'
    expect((await GET(get(''))).status).toBe(403)
    expect((await patch({ id: 'x', aktion: 'status', status: 'gelesen' })).status).toBe(403)
    expect((await uebernahme({ id: 'x', art: 'neu_kunde' })).status).toBe(403)
  })
  it('Liste zeigt keine Entwürfe; Öffnen setzt Neu → Gelesen mit Verlauf und Datei-Links', async () => {
    const { GET } = await import('@/app/api/anfragen/route')
    await einreichen() // bleibt Entwurf
    expect((await (await GET(get(''))).json()).anfragen).toHaveLength(0)
    const id = await eingegangen()
    expect((await (await GET(get('anzahl=1'))).json()).neu).toBe(1)
    const d = await (await GET(get(`id=${id}`))).json()
    expect(d.anfrage.status).toBe('gelesen')
    expect(d.dateien[0].url).toContain('token=dl')
    expect(db.externe_anfragen_protokoll.map((p) => p.aktion)).toContain('gelesen')
    expect((await (await GET(get('anzahl=1'))).json()).neu).toBe(0)
  })
  it('Statuswechsel mit Verlauf; „Übernommen“ nicht von Hand', async () => {
    const id = await eingegangen()
    expect((await patch({ id, aktion: 'status', status: 'rueckfrage', text: 'Plan fehlt' })).status).toBe(200)
    expect((await patch({ id, aktion: 'status', status: 'uebernommen' })).status).toBe(409)
    expect((await patch({ id, aktion: 'status', status: 'rueckfrage' })).status).toBe(409)
    const log = db.externe_anfragen_protokoll.find((p) => p.nach_status === 'rueckfrage')!
    expect(log.benutzer_name).toBe('Chefin'); expect(log.created_at).toBeTruthy(); expect(log.text).toBe('Plan fehlt')
  })
  it('Zugangslink anlegen und widerrufen', async () => {
    const { POST, PATCH } = await import('@/app/api/anfragen/route')
    const j = await (await POST(req({ aktion: 'zugang', customer_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bezeichnung: 'Test' }))).json()
    expect(j.zugang.token).toMatch(/^[a-f0-9]{48}$/)
    await PATCH(req({ aktion: 'zugang_widerrufen', zugang_id: j.zugang.id }, 'PATCH'))
    expect(db.anfrage_zugaenge.find((z) => z.id === j.zugang.id)!.revoked_at).toBeTruthy()
  })
})

describe('Übernahme', () => {
  it('A: neuer Kunde + Baustelle mit Land; Dateien erscheinen bei der Baustelle; Anfrage übernommen', async () => {
    const id = await eingegangen()
    const r = await uebernahme({ id, art: 'neu_kunde', kunde: { name: 'Neu Bau AG' }, baustelle: { name: 'Haus A', adresse: 'Rue 5', land: 'Luxemburg' } })
    expect(r.status).toBe(200)
    expect(db.customers).toHaveLength(2)
    expect(db.projects).toHaveLength(1)
    expect(db.projects[0].customer_id).toBe(db.customers[1].id)
    expect(db.projects[0].land).toBe('Luxemburg')
    const a = db.externe_anfragen[0]
    expect(a.status).toBe('uebernommen'); expect(a.uebernommen_project_id).toBe(db.projects[0].id); expect(a.uebernommen_von).toBe('u1')
    expect(db.project_media).toHaveLength(1)
    expect(db.externe_anfragen_protokoll.some((p) => p.aktion === 'uebernahme')).toBe(true)
  })
  it('zweite Übernahme (Doppelklick, auch gleichzeitig) legt nichts doppelt an', async () => {
    const id = await eingegangen()
    const body = { id, art: 'neu_kunde', kunde: { name: 'Neu Bau AG' }, baustelle: {} }
    const [x, y] = await Promise.all([uebernahme(body), uebernahme(body)])
    expect([x.status, y.status].sort()).toEqual([200, 409])
    expect((await uebernahme(body)).status).toBe(409)
    expect(db.customers).toHaveLength(2)
    expect(db.projects).toHaveLength(1)
  })
  it('B: bestehender Kunde, KEIN neuer Kunde; unbekannter Kunde wird abgelehnt', async () => {
    const id = await eingegangen()
    expect((await uebernahme({ id, art: 'bestehender_kunde', customer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })).status).toBe(404)
    expect(db.projects).toHaveLength(0)
    expect(db.externe_anfragen[0].uebernahme_gestartet_am ?? null).toBeNull() // nichts beansprucht
    const kid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; db.customers.push({ id: kid, name: 'Alt AG' })
    const r = await uebernahme({ id, art: 'bestehender_kunde', customer_id: kid, baustelle: { name: 'Neue Baustelle' } })
    expect(r.status).toBe(200)
    expect(db.customers).toHaveLength(2)
    expect(db.projects[0].customer_id).toBe(kid)
    expect(db.externe_anfragen[0].uebernommen_art).toBe('bestehender_kunde')
  })
  it('A: ähnlicher Kunde (gleiche E-Mail) wird gemeldet, nichts angelegt; „trotzdem neu“ geht', async () => {
    const id = await eingegangen()
    const r = await uebernahme({ id, art: 'neu_kunde', kunde: { name: 'Anders GmbH', email: 'INFO@bestand.de' } })
    expect(r.status).toBe(409)
    expect((await r.json()).aehnlich[0].id).toBe('c-alt')
    expect(db.customers).toHaveLength(1); expect(db.projects).toHaveLength(0)
    expect((await uebernahme({ id, art: 'neu_kunde', kunde: { name: 'Anders GmbH', email: 'info@bestand.de' }, trotzdem_neu: true })).status).toBe(200)
    expect(db.customers).toHaveLength(2)
  })
  it('Fehler mitten drin: angelegter Kunde wird zurückgenommen, Anfrage bleibt offen und kann erneut übernommen werden', async () => {
    const id = await eingegangen()
    kaputt.projects = true
    expect((await uebernahme({ id, art: 'neu_kunde', kunde: { name: 'Neu Bau AG' } })).status).toBe(500)
    expect(db.customers).toHaveLength(1); expect(db.projects).toHaveLength(0)
    expect(db.externe_anfragen[0].status).not.toBe('uebernommen')
    expect(db.externe_anfragen[0].uebernahme_gestartet_am).toBeNull()
    kaputt.projects = false
    expect((await uebernahme({ id, art: 'neu_kunde', kunde: { name: 'Neu Bau AG' } })).status).toBe(200)
    expect(db.customers).toHaveLength(2)
  })
  it('C: Zurückstellen = „In Prüfung“, danach weiterhin übernehmbar; abgelehnte erst nach Wiedereröffnung', async () => {
    const id = await eingegangen()
    expect((await patch({ id, aktion: 'status', status: 'in_pruefung', text: 'Zurückgestellt' })).status).toBe(200)
    expect(db.customers).toHaveLength(1); expect(db.projects).toHaveLength(0)
    expect((await patch({ id, aktion: 'status', status: 'abgelehnt', text: 'Kein Bedarf' })).status).toBe(200)
    expect((await uebernahme({ id, art: 'neu_kunde', kunde: { name: 'X' } })).status).toBe(409)
    await patch({ id, aktion: 'status', status: 'in_pruefung' })
    expect((await uebernahme({ id, art: 'neu_kunde', kunde: { name: 'Neu Bau AG' } })).status).toBe(200)
    expect((await patch({ id, aktion: 'status', status: 'gelesen' })).status).toBe(409) // übernommen = gesperrt
  })
  it('Entwurf lässt sich nicht übernehmen', async () => {
    const e = await einreichen()
    expect((await uebernahme({ id: e.j1.anfrage_id, art: 'neu_kunde', kunde: { name: 'X' } })).status).toBe(404)
  })
})
