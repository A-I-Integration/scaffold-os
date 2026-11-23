import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'
import { plusTage, faelligeVorhaltung, vorhaltungStand, normalisiereVereinbarung, normalisierePerioden } from '@/lib/vorhaltung'

// ============================================================
// Kettentest Faktura F8: Vorhalteabrechnung läuft durch die ECHTE Route /api/invoices.
// Nachgebaut sind create_invoice und vorhaltung_zuordnen (Annahme: wie phase-127, ein Aufruf ist unteilbar, weil das Projekt gesperrt ist).
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }),
  }),
}))
vi.mock('@/lib/angebot-annahme', () => ({ beiAngebotsannahmeSicher: async () => {} }))
vi.mock('@/lib/auto-tour', () => ({ fahrtNachholenSicher: async () => {} }))

const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const HEUTE = new Date().toISOString().slice(0, 10)
let db: Tabellen
let createFehler = false

const vereinbarung = () => ({ aktiv: true, beginn: plusTage(HEUTE, -40), freiTage: 28, intervall: 'woche', preis: 100, abrechnung: 'im_voraus', teilabbauten: [] })
const projekt = () => db.projects[0] as any
const faellig = () => faelligeVorhaltung(normalisiereVereinbarung(projekt().data.vorhaltung)!, normalisierePerioden(projekt().data.vorhaltePerioden), HEUTE)!
const stand = () => vorhaltungStand(normalisiereVereinbarung(projekt().data.vorhaltung), normalisierePerioden(projekt().data.vorhaltePerioden))

function zuordnen(p: Record<string, any>): string {
  const d = projekt().data
  let arr: any[] = Array.isArray(d.vorhaltePerioden) ? d.vorhaltePerioden : []
  if (p.p_aktion === 'reservieren') {
    let maxbis: string | null = null
    for (const e of arr) {
      if (e.von < p.p_periode.bis && e.bis > p.p_periode.von) return e.rechnungId ? 'ueberschneidung' : 'reserviert'
      if (!maxbis || e.bis > maxbis) maxbis = e.bis
    }
    if ((maxbis ?? null) !== (p.p_erwartet_bis ?? null)) return 'geaendert'
    arr = [...arr, { ...p.p_periode, id: p.p_token, reserviertAm: new Date().toISOString() }]
  } else if (p.p_aktion === 'abschliessen') {
    const i = arr.findIndex((e) => e.id === p.p_token && e.reserviertAm)
    if (i < 0) return 'keine_reservierung'
    const { reserviertAm, ...rest } = arr[i]
    arr = arr.map((e, k) => (k === i ? { ...rest, rechnungId: p.p_invoice_id, rechnungNr: p.p_invoice_number } : e))
  } else if (p.p_aktion === 'freigeben') {
    if (!arr.some((e) => e.id === p.p_token && e.reserviertAm && !e.rechnungId)) return 'keine_reservierung'
    arr = arr.filter((e) => e.id !== p.p_token)
  } else if (p.p_aktion === 'freigeben_rechnung') {
    if (!arr.some((e) => e.rechnungId === p.p_invoice_id)) return 'nicht_gefunden'
    arr = arr.filter((e) => e.rechnungId !== p.p_invoice_id)
  }
  d.vorhaltePerioden = arr
  return 'ok'
}

beforeEach(() => {
  createFehler = false
  db = {
    invoices: [], project_events: [{ id: 'e1', project_id: P1, type: 'pruefung_freigabe', pruefung_details: { freigegeben: true } }],
    projects: [{ id: P1, customer_id: 'c1', name: 'Test', adresse: 'x', status: 'active', aufmass_version: 0, data: { vorhaltung: vereinbarung() } }],
    company_settings: [], invoice_freigabe_override: [], abrechnung_historie: [], invoice_dispatches: [], project_versions: [],
  }
  const rest = baueFakeRest(db)
  vi.stubGlobal('fetch', async (eingabe: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(eingabe))
    const rpc = u.pathname.split('/rest/v1/rpc/')[1]
    if (!rpc) return rest(eingabe, init)
    const p = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    if (rpc === 'vorhaltung_zuordnen') { await Promise.resolve(); return json(zuordnen(p)) }
    if (rpc === 'aufmass_zuordnen') return json('nicht_gefunden')
    if (createFehler) return json({ message: 'boom' }, 500)
    await Promise.resolve()
    if (rpc === 'rechnung_anlegen_zugeordnet') {
      const q = p.p_params as Record<string, any>
      const z0 = { id: `inv-${db.invoices.length + 1}`, invoice_number: `RE-2026-${String(db.invoices.length + 1).padStart(4, '0')}`, status: 'offen', paid_amount: 0, net_amount: q.p_net_amount, gross_amount: q.p_gross_amount, invoice_type: q.p_invoice_type, invoice_date: q.p_invoice_date, project_id: q.p_project_id, positions: q.p_positions }
      db.invoices.push(z0)
      const erg = zuordnen({ p_aktion: 'abschliessen', p_token: p.p_token, p_invoice_id: z0.id, p_invoice_number: z0.invoice_number })
      if (erg !== 'ok') { db.invoices.pop(); return json({ message: 'zuordnung_fehlgeschlagen:' + erg }, 400) }
      return json([z0])
    }
    const nr = String(db.invoices.length + 1).padStart(4, '0')
    const zeile = { id: `inv-${db.invoices.length + 1}`, invoice_number: `RE-2026-${nr}`, status: 'offen', paid_amount: 0, net_amount: p.p_net_amount, gross_amount: p.p_gross_amount, invoice_type: p.p_invoice_type, invoice_date: p.p_invoice_date, project_id: p.p_project_id, positions: p.p_positions, reference_invoice_number: p.p_reference_invoice_number ?? null }
    db.invoices.push(zeile)
    return json([zeile])
  })
})

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/invoices/route')
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ customer_name: 'Muster GmbH', project_id: P1, invoice_type: 'standard', ...body }) }) as never)
}
const body = (o: Record<string, unknown> = {}) => { const f = faellig(); return { positions: f.positionen, vorhaltung: { von: f.von, bis: f.bis, stand: stand() }, ...o } }

describe('Kette Vorhaltung abrechnen', () => {
  it('Normalfall: Rechnung nur für den fälligen Zeitraum, Zeitraum gespeichert, Verlauf geschrieben', async () => {
    const erwartet = faellig()
    const r = await post(body())
    expect(r.status).toBe(200)
    expect(db.invoices).toHaveLength(1)
    expect((db.invoices[0] as any).positions.every((p: any) => p.art === 'miete')).toBe(true)
    expect(projekt().data.vorhaltePerioden).toHaveLength(1)
    expect(projekt().data.vorhaltePerioden[0]).toMatchObject({ von: erwartet.von, bis: erwartet.bis, rechnungId: 'inv-1' })
    expect(projekt().data.vorhaltePerioden[0].reserviertAm).toBeUndefined()
    expect(db.abrechnung_historie.some((h: any) => h.aktion === 'vorhaltung_abgerechnet' && h.user_id === 'u1')).toBe(true)
  })

  it('Zwei gleichzeitige Abrechnungen desselben Zeitraums: genau eine Rechnung', async () => {
    const b = body()
    const [a, c] = await Promise.all([post(b), post(b)])
    expect([a.status, c.status].sort()).toEqual([200, 409])
    expect(db.invoices).toHaveLength(1)
    expect(projekt().data.vorhaltePerioden).toHaveLength(1)
  })

  it('Zweiter Versuch mit altem Stand wird abgelehnt (kein Doppel), danach ist nur der Folgezeitraum abrechenbar', async () => {
    const b = body()
    expect((await post(b)).status).toBe(200)
    const nochmal = await post(b)
    expect(nochmal.status).toBe(409)
    expect(db.invoices).toHaveLength(1)
  })

  it('Falsche Positionen, falscher Zeitraum oder geänderte Vereinbarung werden abgelehnt', async () => {
    const b = body()
    const falsch = await post({ ...b, positions: [{ bezeichnung: 'x', menge: 99, einheit: 'Wo.', einzelpreis: 100, art: 'miete' }] })
    expect(falsch.status).toBe(409); expect((await falsch.json()).code).toBe('VORHALTUNG_ABWEICHUNG')
    const zeit = await post({ ...b, vorhaltung: { ...b.vorhaltung, bis: plusTage(b.vorhaltung.bis, 7) } })
    expect((await zeit.json()).code).toBe('VORHALTUNG_ZEITRAUM')
    projekt().data.vorhaltung.preis = 120
    const geaendert = await post(b)
    expect((await geaendert.json()).code).toBe('VORHALTUNG_GEAENDERT')
    expect(db.invoices).toHaveLength(0)
  })

  it('Ohne aktive Vereinbarung wird nichts nach Kalender abgerechnet', async () => {
    const b = body()
    projekt().data.vorhaltung.aktiv = false
    const r = await post(b)
    expect(r.status).toBe(409)
    expect(db.invoices).toHaveLength(0)
  })

  it('Scheitert das Anlegen der Rechnung, wird der Zeitraum freigegeben', async () => {
    createFehler = true
    expect((await post(body())).status).toBe(500)
    expect(projekt().data.vorhaltePerioden ?? []).toHaveLength(0)
    createFehler = false
    expect((await post(body())).status).toBe(200)
  })

  it('Storno gibt den Zeitraum wieder frei (mit Verlauf), Löschen ebenso', async () => {
    await post(body())
    const { PATCH, DELETE } = await import('@/app/api/invoices/route')
    expect((await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: 'inv-1', status: 'storniert' }) }) as never)).status).toBe(200)
    expect(projekt().data.vorhaltePerioden).toHaveLength(0)
    expect(db.abrechnung_historie.some((h: any) => h.aktion === 'vorhaltung_freigegeben')).toBe(true)
    await post(body())
    expect((await DELETE(new Request('http://x?id=inv-2', { method: 'DELETE' }) as never)).status).toBe(200)
    expect(projekt().data.vorhaltePerioden).toHaveLength(0)
  })

  it('Die Speicherroute ändert berechnete Zeiträume nicht, protokolliert aber Änderungen der Vereinbarung mit Grund', async () => {
    const faelligNetto0 = faellig().netto
    await post(body())
    const { PATCH } = await import('@/app/api/projects/route')
    const patch = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: P1, data, ...extra }) }) as never)
    expect((await patch({ vorhaltePerioden: [] })).status).toBe(409)
    expect(projekt().data.vorhaltePerioden).toHaveLength(1)
    // Preisänderung ohne Datum würde den berechneten Zeitraum verändern: abgelehnt
    const abgelehnt = await patch({ vorhaltung: { ...vereinbarung(), preis: 150 } }, { aenderungsgrund: 'Preisanpassung' })
    expect(abgelehnt.status).toBe(409); expect((await abgelehnt.json()).code).toBe('VORHALTUNG_VEREINBARUNG_GESPERRT')
    expect(projekt().data.vorhaltung.preis).toBe(100)
    // Neuer Preis ab ausdrücklichem Datum nach dem berechneten Zeitraum: erlaubt, alter Preis bleibt im Verlauf nachvollziehbar
    const bis = projekt().data.vorhaltePerioden[0].bis
    const r = await patch({ vorhaltung: { ...vereinbarung(), preisStufen: [{ ab: bis, preis: 150 }] } }, { aenderungsgrund: 'Preisanpassung vereinbart' })
    expect(r.status).toBe(200)
    const h = db.abrechnung_historie.find((x: any) => x.aktion === 'vorhaltung_vereinbart') as any
    expect(h).toMatchObject({ user_id: 'u1', grund: 'Preisanpassung vereinbart' })
    expect(h.details.von.preis).toBe(100); expect(h.details.von.preisStufen).toBeUndefined(); expect(h.details.auf.preisStufen).toEqual([{ ab: bis, preis: 150 }])
    expect(projekt().data.vorhaltePerioden).toHaveLength(1)
    expect(projekt().data.vorhaltePerioden[0].netto).toBe(faelligNetto0)
  })

  it('Eine Vorhaltungs-Rechnung zählt nicht zum Auftragswert (keine Abweichungsmeldung für spätere Rechnungen)', async () => {
    projekt().data.kiResult = { suggestedPrice: 1000 }
    projekt().data.preisModus = 'pauschale'; projekt().data.pauschale = '1000'
    // Vorhaltung 5 Wochen = 500 netto, danach eine Rechnung über den vollen Auftragswert: ohne Ausnahme wären 1.500 > 1.000
    expect((await post(body())).status).toBe(200)
    const r = await post({ positions: [{ bezeichnung: 'Gerüstbau', menge: 1, einheit: 'Pauschale', einzelpreis: 1000 }] })
    expect(r.status).toBe(200)
  })

  // ── Integritätsrunde (Storno/Gutschrift, Löschen, Vertragsänderungen, F7/F8) ──
  const storno = async (id: string) => { const { PATCH } = await import('@/app/api/invoices/route'); return PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id, status: 'storniert' }) }) as never) }
  const versendet = (id: string) => (db.invoice_dispatches as any[]).push({ id: 'd-' + id, invoice_id: id, kind: 'rechnung', status: 'versendet' })
  const gutschrift = (nr: string, netto: number) => post({ invoice_type: 'gutschrift', reference_invoice_number: nr, positions: [{ bezeichnung: 'Gutschrift Vorhaltung', menge: 1, einheit: 'Pauschale', einzelpreis: netto }] })

  it('Bereits versendete Vorhalte-Rechnung stornieren: Zeitraum bleibt berechnet, im Verlauf vermerkt', async () => {
    await post(body()); versendet('inv-1')
    const r = await storno('inv-1')
    expect(r.status).toBe(200); expect((await r.json()).hinweis).toContain('bleiben berechnet')
    expect(projekt().data.vorhaltePerioden).toHaveLength(1)
    expect(db.abrechnung_historie.some((h: any) => h.aktion === 'vorhaltung_freigegeben')).toBe(false)
    expect((db.abrechnung_historie.find((h: any) => h.aktion === 'storniert') as any).details.zuordnung).toBe('bleibt bis Gutschrift')
    // derselbe Zeitraum kann NICHT erneut abgerechnet werden
    const nochmal = faelligeVorhaltung(normalisiereVereinbarung(projekt().data.vorhaltung)!, normalisierePerioden(projekt().data.vorhaltePerioden), HEUTE)
    expect(nochmal?.von === projekt().data.vorhaltePerioden[0].von).toBe(false)
  })

  it('Erst eine volle Gutschrift gibt den Zeitraum einer versendeten Rechnung frei – eine Teil-Gutschrift nicht', async () => {
    const netto = faellig().netto
    await post(body()); versendet('inv-1'); await storno('inv-1')
    expect((await gutschrift('RE-2026-0001', netto / 2)).status).toBe(200)
    expect(projekt().data.vorhaltePerioden).toHaveLength(1)
    expect((await gutschrift('RE-2026-0001', netto / 2)).status).toBe(200)
    expect(projekt().data.vorhaltePerioden).toHaveLength(0)
    const h = db.abrechnung_historie.find((x: any) => x.aktion === 'vorhaltung_freigegeben') as any
    expect(h.details.grund).toContain('Gutschrift')
  })

  it('Nicht versendete Vorhalte-Rechnung löschen gibt den Zeitraum frei; versendete lässt sich nicht löschen', async () => {
    const { DELETE } = await import('@/app/api/invoices/route')
    await post(body())
    expect((await DELETE(new Request('http://x?id=inv-1', { method: 'DELETE' }) as never)).status).toBe(200)
    expect(projekt().data.vorhaltePerioden).toHaveLength(0)
    expect((db.abrechnung_historie.find((x: any) => x.aktion === 'vorhaltung_freigegeben') as any).details.grund).toContain('nicht versendet')
    await post(body()); versendet('inv-1')
    const r = await DELETE(new Request('http://x?id=inv-1', { method: 'DELETE' }) as never)
    expect(r.status).toBe(409); expect((await r.json()).code).toBe('BEREITS_VERSENDET')
    expect(projekt().data.vorhaltePerioden).toHaveLength(1)
  })

  it('Nicht prüfbarer Versandstatus zählt als versendet (nichts wird freigegeben)', async () => {
    await post(body())
    const orig = (globalThis as any).fetch
    vi.stubGlobal('fetch', async (e: RequestInfo | URL, i?: RequestInit) => String(e).includes('invoice_dispatches') ? new Response('x', { status: 500 }) : orig(e, i))
    expect((await storno('inv-1')).status).toBe(200)
    expect(projekt().data.vorhaltePerioden).toHaveLength(1)
  })

  it('Eine Rechnung kann nicht Aufmaß und Vorhaltung zugleich abrechnen', async () => {
    const b = body()
    const r = await post({ ...b, aufmass: { za_id: 'za1', stand: 'x' } })
    expect(r.status).toBe(400); expect((await r.json()).code).toBe('ABRECHNUNG_ART_MEHRFACH')
    expect(db.invoices).toHaveLength(0)
  })

  it('Freie Mietposition bei aktiver Vorhalte-Vereinbarung braucht eine dokumentierte Begründung (keine stille Doppelabrechnung)', async () => {
    const pos = [{ bezeichnung: 'Gerüstmiete frei', menge: 4, einheit: 'Wo.', einzelpreis: 100, art: 'miete' }]
    const r = await post({ positions: pos })
    expect(r.status).toBe(409); expect((await r.json()).abweichungen.map((a: any) => a.code)).toContain('VORHALTUNG_FREIE_MIETE')
    expect(db.invoices).toHaveLength(0)
  })

  it('Gleichzeitige Reservierung: zwei Abrechnungen, Abschluss und Parallelversuch ergeben genau eine Rechnung und einen Zeitraum', async () => {
    const b = body()
    const ergebnisse = await Promise.all([post(b), post(b), post(b)])
    expect(ergebnisse.filter((x) => x.status === 200)).toHaveLength(1)
    expect(db.invoices).toHaveLength(1); expect(projekt().data.vorhaltePerioden).toHaveLength(1)
  })
})
