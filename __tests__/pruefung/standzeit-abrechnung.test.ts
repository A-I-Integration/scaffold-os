import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'

// ============================================================
// Tiefenprüfung automatische Standzeit-Abrechnung (Cron): richtige Wochen, nie doppelt, nur mit Freigabe und Preis.
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.CRON_SECRET = 'geheim'

let db: Tabellen
let nummer = 0
const heuteLokal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const tageZurueck = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function projekt(extra: Record<string, unknown> = {}, daten: Record<string, unknown> = {}) {
  return {
    id: 'p1', name: 'Kirche Nord', adresse: 'Hauptstr. 1', status: 'active',
    data: { step1: { name: 'Gemeinde', projektende: tageZurueck(10) }, angebotAnpassungen: { miete: { preisProWoche: 100 } }, ...daten }, ...extra,
  }
}

beforeEach(() => {
  nummer = 0
  db = {
    projects: [projekt()],
    project_events: [{ id: 'e1', project_id: 'p1', type: 'pruefung_freigabe', pruefung_details: { freigegeben: true } }],
    invoices: [], company_settings: [{ id: '00000000-0000-0000-0000-000000000001', company_name: 'Gerüstbau Test' }],
  }
  const fake = baueFakeRest(db)
  vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) =>
    String(u).includes('/rpc/next_invoice_number')
      ? new Response(JSON.stringify(`RE-2026-${String(++nummer).padStart(4, '0')}`), { status: 200 })
      : fake(u, init))
})

async function lauf() {
  const { GET } = await import('@/app/api/cron/standzeit-abrechnung/route')
  return (await GET(new Request('http://x', { headers: { authorization: 'Bearer geheim' } }) as never)).json()
}

describe('Standzeit-Abrechnung', () => {
  it('10 Tage über der Standzeit = 2 angefangene Wochen, Beträge stimmen, Entwurf ohne Versand', async () => {
    const r = await lauf()
    expect(r.erstellt).toHaveLength(1)
    expect(db.invoices).toHaveLength(1)
    expect(db.invoices[0]).toMatchObject({ net_amount: 200, tax_amount: 38, gross_amount: 238, status: 'offen', project_id: 'p1', invoice_date: heuteLokal() })
    expect((db.invoices[0].positions as { menge: number }[])[0].menge).toBe(2)
  })
  it('läuft am nächsten Tag nicht erneut für dieselben Wochen (Merker gesetzt)', async () => {
    await lauf(); await lauf(); await lauf()
    expect(db.invoices).toHaveLength(1)
    expect((db.projects[0].data as Record<string, unknown>).mietAbgerechnetBis).toBeTruthy()
  })
  it('Standzeit wächst weiter: erst 6 Wochen, später genau die neuen Wochen, nichts doppelt', async () => {
    db.projects[0] = projekt({}, { step1: { name: 'Gemeinde', projektende: tageZurueck(40) } })
    await lauf()
    expect((db.invoices[0].positions as { menge: number }[])[0].menge).toBe(6) // 40 Tage = 6 angefangene Wochen
    const merker = (db.projects[0].data as { mietAbgerechnetBis: string }).mietAbgerechnetBis
    expect(merker > heuteLokal()).toBe(true) // bezahlt bis in die Zukunft: heute nichts mehr offen
    expect((await lauf()).erstellt).toHaveLength(0)
    // 20 Tage später: Projektende und Merker liegen entsprechend weiter zurück
    ;(db.projects[0].data as { step1: { projektende: string } }).step1.projektende = tageZurueck(60)
    ;(db.projects[0].data as { mietAbgerechnetBis: string }).mietAbgerechnetBis = tageZurueck(18)
    const r = await lauf()
    expect(r.erstellt).toHaveLength(1)
    expect((db.invoices[1].positions as { menge: number }[])[0].menge).toBe(3) // 18 Tage seit Merker
  })
  it('nicht überzogen → keine Rechnung', async () => {
    db.projects[0] = projekt({}, { step1: { projektende: tageZurueck(-5) } })
    expect((await lauf()).erstellt).toHaveLength(0)
  })
  it('ohne Wochenpreis: gemeldet, nichts erfunden', async () => {
    db.projects[0] = projekt({}, { angebotAnpassungen: {} })
    const r = await lauf()
    expect(r.ohne_preis).toEqual(['Kirche Nord'])
    expect(db.invoices).toHaveLength(0)
  })
  it('ohne Prüf-Freigabe: übersprungen und gemeldet', async () => {
    db.project_events = []
    const r = await lauf()
    expect(r.ohne_freigabe).toEqual(['Kirche Nord'])
    expect(db.invoices).toHaveLength(0)
  })
  it('nur aktive Projekte werden berücksichtigt (Abfrage filtert nach Status)', async () => {
    const urls: string[] = []
    const echt = fetch
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) => { urls.push(String(u)); return echt(u, init) })
    await lauf()
    expect(urls.some((u) => u.includes('projects?status=eq.active'))).toBe(true)
  })
  it('Speichern des Abrechnungsstands scheitert: Rechnung wird zurückgenommen, keine Doppelabrechnung am Folgetag', async () => {
    const echt = fetch
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) =>
      String(u).includes('/projects?id=') && init?.method === 'PATCH' ? new Response('db kaputt', { status: 500 }) : echt(u, init))
    const r = await lauf()
    expect(r.fehler).toHaveLength(1)
    expect(r.fehler[0]).toMatch(/zurückgenommen/)
    expect(db.invoices).toHaveLength(0)
    // Datenbank wieder erreichbar: genau eine Rechnung
    vi.stubGlobal('fetch', echt)
    await lauf()
    expect(db.invoices).toHaveLength(1)
  })
  it('ohne Secret kein Zugriff', async () => {
    const { GET } = await import('@/app/api/cron/standzeit-abrechnung/route')
    expect((await GET(new Request('http://x') as never)).status).toBe(401)
  })
})
