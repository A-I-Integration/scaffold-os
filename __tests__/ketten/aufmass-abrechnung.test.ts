import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'
import { aufmassStand } from '@/lib/aufmass-integritaet'
import { normalisiereZwischenaufmasse } from '@/lib/zwischenaufmass'

// ============================================================
// Kettentest Faktura F7-Sicherung: Aufmaß-Abrechnung läuft durch die ECHTE Route /api/invoices.
// Nachgebaut sind nur die Datenbankfunktionen create_invoice(_as_new_version) und aufmass_zuordnen
// (Annahme: wie in supabase/phase-126 – ein Aufruf ist unteilbar, weil das Projekt dabei gesperrt ist).
// Geprüft wird alles, was die Route selbst entscheidet: Prüfung, Reservierung, Freigabe, Zuordnung.
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }),
  }),
}))

const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let db: Tabellen
let createFehler = false

const zaRoh = (o: Record<string, unknown>) => ({ erstelltAm: '', notiz: '', ...o })
const ZA1 = zaRoh({ id: 'za1', nr: 1, stichtag: '2026-03-01', flaecheM2: 100, positionen: [{ key: 'gerüst süd|m²', bezeichnung: 'Gerüst Süd', einheit: 'm²', einzelpreis: 10, menge: 100 }] })

function zuordnen(p: Record<string, any>): string {
  const proj = db.projects.find((x) => x.id === p.p_project) as any
  if (!proj) return 'projekt_fehlt'
  const arr = (proj.data?.zwischenaufmasse ?? []) as any[]
  const i = arr.findIndex((e) => (['freigeben_rechnung', 'ersetzen'].includes(p.p_aktion) ? e.rechnungId === p.p_invoice_id : e.id === p.p_za_id))
  if (i < 0) return 'nicht_gefunden'
  let el = { ...arr[i] }
  if (p.p_aktion === 'reservieren') {
    if (el.rechnungId) return 'bereits_abgerechnet'
    if (el.reserviertAm) return 'reserviert'
    const { reserviertAm, reserviertToken, ...rest } = el
    if (JSON.stringify(rest) !== JSON.stringify(p.p_erwartet)) return 'geaendert'
    el = { ...el, reserviertAm: new Date().toISOString(), reserviertToken: p.p_token }
  } else if (p.p_aktion === 'abschliessen') {
    if (el.reserviertToken !== p.p_token) return 'keine_reservierung'
    delete el.reserviertAm; delete el.reserviertToken
    el = { ...el, rechnungId: p.p_invoice_id, rechnungNr: p.p_invoice_number, abgerechnetAm: p.p_heute }
  } else if (p.p_aktion === 'freigeben') {
    if (el.reserviertToken !== p.p_token) return 'keine_reservierung'
    delete el.reserviertAm; delete el.reserviertToken
  } else if (p.p_aktion === 'freigeben_rechnung') {
    delete el.rechnungId; delete el.rechnungNr; delete el.abgerechnetAm
  } else if (p.p_aktion === 'ersetzen') {
    el = { ...el, rechnungId: p.p_neu_invoice_id, rechnungNr: p.p_invoice_number }
  }
  arr[i] = el
  return 'ok'
}

beforeEach(() => {
  createFehler = false
  db = {
    invoices: [], project_events: [{ id: 'e1', project_id: P1, type: 'pruefung_freigabe', pruefung_details: { freigegeben: true } }],
    projects: [{ id: P1, customer_id: 'c1', data: { zwischenaufmasse: [JSON.parse(JSON.stringify(ZA1))] } }],
    company_settings: [], invoice_freigabe_override: [], abrechnung_historie: [], invoice_dispatches: [],
  }
  const rest = baueFakeRest(db)
  vi.stubGlobal('fetch', async (eingabe: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(eingabe))
    const rpc = u.pathname.split('/rest/v1/rpc/')[1]
    if (!rpc) return rest(eingabe, init)
    const p = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (rpc === 'aufmass_zuordnen') { await Promise.resolve(); return json(zuordnen(p)) }
    if (createFehler) return json({ message: 'boom' }, 500)
    await Promise.resolve()
    const nr = String(db.invoices.length + 1).padStart(4, '0')
    const zeile = { id: `inv-${db.invoices.length + 1}`, invoice_number: `${p.p_prefix}-2026-${nr}`, status: 'offen', paid_amount: 0, net_amount: p.p_net_amount, gross_amount: p.p_gross_amount, invoice_type: p.p_invoice_type, invoice_date: p.p_invoice_date, project_id: p.p_project_id }
    db.invoices.push(zeile)
    if (rpc === 'create_invoice_as_new_version') { const alt = db.invoices.find((i) => i.id === p.p_old_invoice_id); if (alt) alt.status = 'storniert' }
    return json([zeile])
  })
})

const za = () => (db.projects[0] as any).data.zwischenaufmasse[0]
const stand = () => aufmassStand(normalisiereZwischenaufmasse([za()])[0])
const posZa = (menge = 100) => [{ bezeichnung: 'egal', menge, einheit: 'm²', einzelpreis: 10 }]
async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/invoices/route')
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ customer_name: 'Muster GmbH', project_id: P1, invoice_type: 'abschlag', ...body }) }) as never)
}
const aufmassBody = (o: Record<string, unknown> = {}) => ({ positions: posZa(), aufmass: { za_id: 'za1', stand: stand() }, ...o })

describe('Kette Aufmaß abrechnen (serverseitig abgesichert)', () => {
  it('Normalfall: Rechnung entsteht, Aufmaß wird der Rechnung zugeordnet, Verlauf hat den Eintrag', async () => {
    const r = await post(aufmassBody())
    expect(r.status).toBe(200)
    expect(za()).toMatchObject({ rechnungId: 'inv-1', rechnungNr: expect.stringContaining('RE-') })
    expect(za().reserviertAm).toBeUndefined()
    expect(db.abrechnung_historie.some((h: any) => h.aktion === 'aufmass_abgerechnet' && h.user_id === 'u1')).toBe(true)
  })

  it('Zwei gleichzeitige Abrechnungsversuche derselben Differenz: genau eine Rechnung', async () => {
    const [a, b] = await Promise.all([post(aufmassBody()), post(aufmassBody())])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(db.invoices).toHaveLength(1)
    const fehler = await (a.status === 409 ? a : b).json()
    expect(['AUFMASS_IN_BEARBEITUNG', 'AUFMASS_BEREITS_ABGERECHNET']).toContain(fehler.code)
  })

  it('Doppelabrechnung nacheinander: zweiter Versuch wird abgelehnt, keine zweite Rechnung', async () => {
    const st = stand()
    expect((await post({ positions: posZa(), aufmass: { za_id: 'za1', stand: st } })).status).toBe(200)
    const r = await post({ positions: posZa(), aufmass: { za_id: 'za1', stand: st } })
    expect(r.status).toBe(409)
    expect((await r.json()).code).toBe('AUFMASS_BEREITS_ABGERECHNET')
    expect(db.invoices).toHaveLength(1)
  })

  it('Aufmaß nach dem Öffnen des Dialogs verändert: abgelehnt, nichts angelegt', async () => {
    const alterStand = stand()
    za().positionen[0].menge = 120
    const r = await post({ positions: posZa(), aufmass: { za_id: 'za1', stand: alterStand } })
    expect(r.status).toBe(409)
    expect((await r.json()).code).toBe('AUFMASS_GEAENDERT')
    expect(db.invoices).toHaveLength(0)
  })

  it('Positionen passen nicht zur offenen Differenz: abgelehnt', async () => {
    const r = await post({ positions: posZa(150), aufmass: { za_id: 'za1', stand: stand() } })
    expect(r.status).toBe(409)
    expect((await r.json()).code).toBe('AUFMASS_ABWEICHUNG')
    expect(db.invoices).toHaveLength(0)
  })

  it('Scheitert das Anlegen der Rechnung, wird die Reservierung freigegeben und ein neuer Versuch klappt', async () => {
    createFehler = true
    expect((await post(aufmassBody())).status).toBe(500)
    expect(za().reserviertAm).toBeUndefined()
    createFehler = false
    expect((await post(aufmassBody())).status).toBe(200)
  })

  it('Freie Zusatzposition mit dem Namen einer aufgemessenen Position braucht eine Begründung, sonst nicht', async () => {
    const pos = [{ bezeichnung: 'Gerüst Süd', menge: 5, einheit: 'm²', einzelpreis: 10 }]
    const ohne = await post({ positions: pos })
    expect(ohne.status).toBe(409)
    expect((await ohne.json()).abweichungen.some((a: any) => a.code === 'AUFMASS_POSITION_OHNE_BEZUG')).toBe(true)
    expect((await post({ positions: pos, abrechnung_grund: 'Zusatzleistung laut Absprache mit Bauleitung' })).status).toBe(200)
    expect(za().rechnungId).toBeUndefined()
    expect((await post({ positions: [{ bezeichnung: 'Statik', menge: 1, einheit: 'Pauschale', einzelpreis: 300 }] })).status).toBe(200)
  })

  it('Storno gibt die Menge wieder frei (mit Verlaufseintrag); eine stornierte Rechnung wird nicht wieder geöffnet', async () => {
    await post(aufmassBody())
    const { PATCH } = await import('@/app/api/invoices/route')
    const patch = (b: Record<string, unknown>) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(b) }) as never)
    expect((await patch({ id: 'inv-1', status: 'storniert' })).status).toBe(200)
    expect(za().rechnungId).toBeUndefined()
    expect(db.abrechnung_historie.some((h: any) => h.aktion === 'aufmass_freigegeben')).toBe(true)
    const zurueck = await patch({ id: 'inv-1', status: 'offen' })
    expect(zurueck.status).toBe(409)
    expect((await post(aufmassBody())).status).toBe(200)
  })

  it('Löschen einer offenen, nicht versendeten Rechnung gibt die Menge frei', async () => {
    await post(aufmassBody())
    const { DELETE } = await import('@/app/api/invoices/route')
    expect((await DELETE(new Request('http://x?id=inv-1', { method: 'DELETE' }) as never)).status).toBe(200)
    expect(za().rechnungId).toBeUndefined()
  })

  it('Neue Version: das Aufmaß zeigt danach auf die neue Rechnung', async () => {
    await post(aufmassBody())
    const r = await post({ positions: posZa(), replace_invoice_id: 'inv-1' })
    expect(r.status).toBe(200)
    expect(za().rechnungId).toBe('inv-2')
  })

  it('Eine Aufmaß-Abrechnung kann keine Schluss- oder Gutschrift-Rechnung sein', async () => {
    const r = await post(aufmassBody({ invoice_type: 'schluss' }))
    expect(r.status).toBe(409)
    expect(db.invoices).toHaveLength(0)
  })
})
