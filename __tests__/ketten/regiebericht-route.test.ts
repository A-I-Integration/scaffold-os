import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

// Kettentest Regiebericht: anlegen, unterschreiben, Mail-Rücklauf, Löschen, Preise für Mitarbeiter,
// Übernahme in eine Rechnung (abgerechnet, doppelt, Storno) – über die ECHTEN Routen.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
const ctx = vi.hoisted(() => ({ rolle: 'admin', uid: 'u1' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: ctx.uid } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: ctx.rolle } }) }) }) }),
  }),
}))
vi.mock('@/lib/angebot-annahme', () => ({ beiAngebotsannahmeSicher: async () => {} }))
vi.mock('@/lib/auto-tour', () => ({ fahrtNachholenSicher: async () => {} }))

const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
let db: Tabellen
let rpc: Record<string, unknown>[]

beforeEach(() => {
  ctx.rolle = 'admin'; ctx.uid = 'u1'; rpc = []
  db = { projects: [{ id: P1, name: 'Baustelle', customer_id: 'c1', adresse: 'Rue 1', data: {} }, { id: P2, name: 'Andere', customer_id: 'c1', data: {} }], regieberichte: [], invoices: [], project_events: [{ id: 'e1', project_id: P1, type: 'pruefung_freigabe', pruefung_details: { freigegeben: true } }], customers: [{ id: 'c1', name: 'Kunde', kundentyp: 'gewerblich' }], company_settings: [] }
  const rest = baueFakeRest(db)
  vi.stubGlobal('fetch', async (e: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(e)); const name = u.pathname.split('/rest/v1/rpc/')[1]
    if (!name) {
      // Die Datenbank vergibt UUIDs; der Nachbau nicht: hier nachholen
      if (u.pathname.endsWith('/regieberichte') && (init?.method ?? 'GET') === 'POST') { const b = JSON.parse(String(init?.body ?? '{}')); return rest(e, { ...init, body: JSON.stringify({ id: crypto.randomUUID(), ...b }) }) }
      return rest(e, init)
    }
    const p = JSON.parse(String(init?.body ?? '{}')); rpc.push(p)
    const z = { id: `inv-${db.invoices.length + 1}`, invoice_number: `RE-2026-000${db.invoices.length + 1}`, status: 'offen', net_amount: p.p_net_amount, project_id: p.p_project_id, invoice_type: p.p_invoice_type }
    db.invoices.push(z)
    return new Response(JSON.stringify([z]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
})

const json = (body: unknown, method = 'POST') => new Request('http://x/api', { method, body: JSON.stringify(body) }) as never
async function anlegenBericht(extra: Record<string, unknown> = {}, projekt = P1) {
  const { POST } = await import('@/app/api/regieberichte/route')
  return POST(json({ project_id: projekt, anlass: 'Zusatzanker', beschreibung: 'Anker gesetzt', stunden: [{ name: 'Max', stunden: 8, satz: 50 }], material: [{ bezeichnung: 'Anker', menge: 10, einheit: 'Stk.', einzelpreis: 3 }], ...extra }))
}
async function patch(b: Record<string, unknown>) { const { PATCH } = await import('@/app/api/regieberichte/route'); return PATCH(json(b, 'PATCH')) }
async function rechnung(body: Record<string, unknown>) { const { POST } = await import('@/app/api/invoices/route'); return POST(json({ customer_name: 'Kunde', project_id: P1, ...body })) }
const regieZeile = (nr: string) => ({ bezeichnung: `Regiebericht ${nr} vom 20.11.2026: Stunden Max`, menge: 8, einheit: 'Std.', einzelpreis: 50 })

describe('Regiebericht anlegen und unterschreiben', () => {
  it('legt einen Entwurf mit Nummer an und rechnet Summen', async () => {
    const r = await anlegenBericht()
    expect(r.status).toBe(200)
    const b = (await r.json()).bericht
    expect(b.nummer).toMatch(/^RB-\d{4}-0001$/)
    expect(b.status).toBe('entwurf')
    expect((await (await anlegenBericht()).json()).bericht.nummer).toMatch(/0002$/)
    expect(db.regieberichte[0].customer_id).toBe('c1')
  })
  it('unbekannte Baustelle wird abgelehnt', async () => {
    expect((await anlegenBericht({}, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).status).toBe(404)
  })
  it('Unterschrift braucht Name und PNG, danach gesperrt', async () => {
    const id = (await (await anlegenBericht()).json()).bericht.id
    expect((await patch({ id, aktion: 'unterschreiben', unterschrieben_von: '', unterschrift: PNG })).status).toBe(400)
    expect((await patch({ id, aktion: 'unterschreiben', unterschrieben_von: 'Herr Bau', unterschrift: 'x' })).status).toBe(400)
    const ok = await patch({ id, aktion: 'unterschreiben', unterschrieben_von: 'Herr Bau', unterschrift: PNG })
    expect(ok.status).toBe(200)
    expect((await ok.json()).bericht.status).toBe('unterschrieben')
    expect((await patch({ id, aktion: 'speichern', beschreibung: 'geändert' })).status).toBe(409)
    expect(db.regieberichte[0].beschreibung).toBe('Anker gesetzt')
  })
  it('Rücklauf: nur Büro, nur nach Versand', async () => {
    const id = (await (await anlegenBericht()).json()).bericht.id
    expect((await patch({ id, aktion: 'zurueck' })).status).toBe(409) // noch nicht versendet
    db.regieberichte[0].status = 'versendet'
    ctx.rolle = 'bauleiter'
    expect((await patch({ id, aktion: 'zurueck' })).status).toBe(403)
    ctx.rolle = 'disponent'
    const r = await patch({ id, aktion: 'zurueck' })
    expect((await r.json()).bericht.status).toBe('zurueck')
    expect((await patch({ id, aktion: 'zuruecksetzen' })).status).toBe(200)
    expect(db.regieberichte[0].status).toBe('versendet')
  })
  it('Löschen nur als Entwurf', async () => {
    const { DELETE } = await import('@/app/api/regieberichte/route')
    const id = (await (await anlegenBericht()).json()).bericht.id
    const sig = (await (await anlegenBericht()).json()).bericht.id
    await patch({ id: sig, aktion: 'unterschreiben', unterschrieben_von: 'X', unterschrift: PNG })
    expect((await DELETE(new Request(`http://x/api?id=${sig}`, { method: 'DELETE' }) as never)).status).toBe(409)
    expect((await DELETE(new Request(`http://x/api?id=${id}`, { method: 'DELETE' }) as never)).status).toBe(200)
    expect(db.regieberichte).toHaveLength(1)
  })
})

describe('Preise für Mitarbeiter', () => {
  it('Mitarbeiter sieht und speichert keine Preise, der gespeicherte Stand bleibt erhalten', async () => {
    const id = (await (await anlegenBericht()).json()).bericht.id // Büro: Satz 50, Preis 3
    ctx.rolle = 'mitarbeiter'
    const { GET } = await import('@/app/api/regieberichte/route')
    const g = await (await GET(new Request(`http://x/api?project_id=${P1}`) as never)).json()
    expect(g.preiseSichtbar).toBe(false)
    expect(g.berichte[0].stunden[0].satz).toBe(0)
    expect(g.berichte[0].material[0].einzelpreis).toBe(0)
    await patch({ id, aktion: 'speichern', stunden: [{ name: 'Max', stunden: 9, satz: 0 }], material: [{ bezeichnung: 'Anker', menge: 12, einzelpreis: 0, einheit: 'Stk.' }], beschreibung: 'mehr' })
    expect((db.regieberichte[0].stunden as any)[0]).toMatchObject({ stunden: 9, satz: 50 })
    expect((db.regieberichte[0].material as any)[0]).toMatchObject({ menge: 12, einzelpreis: 3 })
  })
  it('Mitarbeiter-Neuanlage speichert keine Preise, auch wenn welche mitgeschickt werden', async () => {
    ctx.rolle = 'mitarbeiter'
    await anlegenBericht()
    expect((db.regieberichte[0].stunden as any)[0].satz).toBe(0)
  })
  it('Mitarbeiter darf nicht per Mail senden', async () => {
    ctx.rolle = 'mitarbeiter'
    const { POST } = await import('@/app/api/regieberichte/versand/route')
    expect((await POST(json({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', to: 'a@b.de' }))).status).toBe(403)
  })
})

describe('Übernahme in die Rechnung', () => {
  it('abgerechnet wird erst mit der Rechnung gesetzt und zeigt die Rechnungsnummer', async () => {
    const b = (await (await anlegenBericht()).json()).bericht
    const r = await rechnung({ positions: [regieZeile(b.nummer)], regiebericht_ids: [b.id] })
    expect(r.status).toBe(200)
    expect(db.regieberichte[0].rechnung_nummer).toBe((await r.json()).invoice.invoice_number)
    expect(db.regieberichte[0].rechnung_id).toBeTruthy()
    expect(db.regieberichte[0].abgerechnet_am).toBeTruthy()
  })
  it('ein abgerechneter Bericht lässt sich nicht noch einmal abrechnen und nicht mehr ändern', async () => {
    const b = (await (await anlegenBericht()).json()).bericht
    await rechnung({ positions: [regieZeile(b.nummer)], regiebericht_ids: [b.id] })
    const nochmal = await rechnung({ positions: [regieZeile(b.nummer)], regiebericht_ids: [b.id] })
    expect(nochmal.status).toBe(409)
    expect((await nochmal.json()).code).toBe('REGIE_BEREITS_ABGERECHNET')
    expect(db.invoices).toHaveLength(1)
    expect((await patch({ id: b.id, aktion: 'speichern', beschreibung: 'x' })).status).toBe(409)
  })
  it('Bericht einer anderen Baustelle wird abgelehnt', async () => {
    const b = (await (await anlegenBericht({}, P2)).json()).bericht
    const r = await rechnung({ positions: [regieZeile(b.nummer)], regiebericht_ids: [b.id] })
    expect(r.status).toBe(409)
    expect((await r.json()).code).toBe('REGIE_ANDERE_BAUSTELLE')
    expect(db.invoices).toHaveLength(0)
  })
  it('Bericht, dessen Positionen aus der Rechnung entfernt wurden, gilt nicht als abgerechnet', async () => {
    const b = (await (await anlegenBericht()).json()).bericht
    const r = await rechnung({ positions: [{ bezeichnung: 'Etwas anderes', menge: 1, einheit: 'Stk.', einzelpreis: 10 }], regiebericht_ids: [b.id] })
    expect(r.status).toBe(409)
    const j = await r.json()
    expect(j.code).toBe('REGIE_NICHT_IN_RECHNUNG')
    expect(j.regie_ids).toEqual([b.id])
    expect(db.invoices).toHaveLength(0)
    expect(db.regieberichte[0].rechnung_id ?? null).toBeNull()
  })
  it('ohne Baustelle keine Übernahme', async () => {
    const b = (await (await anlegenBericht()).json()).bericht
    const r = await rechnung({ project_id: undefined, positions: [regieZeile(b.nummer)], regiebericht_ids: [b.id] })
    expect(r.status).toBe(400)
  })
  it('noch nicht unterschriebene Berichte werden mit Hinweis übernommen', async () => {
    const b = (await (await anlegenBericht()).json()).bericht
    const r = await rechnung({ positions: [regieZeile(b.nummer)], regiebericht_ids: [b.id] })
    expect((await r.json()).regie_hinweis).toContain(b.nummer)
  })
  it('neue Version der Rechnung übernimmt die Zuordnung', async () => {
    const b = (await (await anlegenBericht()).json()).bericht
    const r1 = await (await rechnung({ positions: [regieZeile(b.nummer)], regiebericht_ids: [b.id] })).json()
    const r2 = await (await rechnung({ positions: [regieZeile(b.nummer)], replace_invoice_id: r1.invoice.id })).json()
    expect(db.regieberichte[0].rechnung_id).toBe(r2.invoice.id)
    expect(db.regieberichte[0].rechnung_nummer).toBe(r2.invoice.invoice_number)
  })
  it('Storno einer nicht versendeten Rechnung gibt den Bericht wieder frei', async () => {
    const b = (await (await anlegenBericht()).json()).bericht
    const r = await (await rechnung({ positions: [regieZeile(b.nummer)], regiebericht_ids: [b.id] })).json()
    const { PATCH } = await import('@/app/api/invoices/route')
    const s = await PATCH(json({ id: r.invoice.id, status: 'storniert' }, 'PATCH'))
    expect(s.status).toBe(200)
    expect(db.regieberichte[0].rechnung_id ?? null).toBeNull()
    expect(db.regieberichte[0].rechnung_nummer ?? null).toBeNull()
  })
})
