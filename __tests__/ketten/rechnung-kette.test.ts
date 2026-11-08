import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

// ============================================================
// Kettentest: Rechnung anlegen (Beträge, Gutschrift, Freigabe-Pflicht, neue Version)
// Läuft durch die ECHTE Route POST /api/invoices. Die Datenbankfunktionen create_invoice und
// create_invoice_as_new_version sind hier NACHGEBAUT (Annahme: sie legen die Zeile an, vergeben die Nummer
// und stornieren bei einer neuen Version die alte). Geprüft wird alles, was die Route selbst entscheidet.
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

const ctx = vi.hoisted(() => ({ rolle: 'admin' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: ctx.rolle } }) }) }) }),
  }),
}))

const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let db: Tabellen
let rpcAufrufe: { name: string; params: Record<string, unknown> }[]

beforeEach(() => {
  ctx.rolle = 'admin'
  rpcAufrufe = []
  db = {
    invoices: [],
    project_events: [],
    projects: [{ id: P1, customer_id: 'c1' }],
    company_settings: [],
    invoice_freigabe_override: [],
  }
  const rest = baueFakeRest(db)
  vi.stubGlobal('fetch', async (eingabe: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(eingabe))
    const rpc = u.pathname.split('/rest/v1/rpc/')[1]
    if (!rpc) return rest(eingabe, init)
    const p = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    rpcAufrufe.push({ name: rpc, params: p })
    const nr = String(db.invoices.length + 1).padStart(4, '0')
    const zeile = {
      id: `inv-${db.invoices.length + 1}`, invoice_number: `${p.p_prefix}-2026-${nr}`, status: 'offen', paid_amount: 0,
      net_amount: p.p_net_amount, tax_amount: p.p_tax_amount, gross_amount: p.p_gross_amount, tax_rate: p.p_tax_rate,
      invoice_type: p.p_invoice_type, due_date: p.p_due_date, invoice_date: p.p_invoice_date, project_id: p.p_project_id,
    }
    db.invoices.push(zeile)
    if (rpc === 'create_invoice_as_new_version') {
      const alt = db.invoices.find((i) => i.id === p.p_old_invoice_id)
      if (alt) alt.status = 'storniert'
    }
    return new Response(JSON.stringify([zeile]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
})

const freigabe = () => db.project_events.push({ id: 'e1', project_id: P1, type: 'pruefung_freigabe', pruefung_details: { freigegeben: true } })
const pos = (menge: number, preis: number) => ({ bezeichnung: 'Gerüst', menge, einheit: 'Stk.', einzelpreis: preis })

async function anlegen(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/invoices/route')
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ customer_name: 'Muster GmbH', ...body }) }) as never)
}

describe('Kette Rechnung anlegen', () => {
  it('Beträge werden serverseitig gerechnet: netto, 19 % Steuer, brutto', async () => {
    const r = await anlegen({ positions: [pos(2, 100), pos(1, 50.5)] })
    expect(r.status).toBe(200)
    expect(rpcAufrufe[0].params).toMatchObject({ p_net_amount: 250.5, p_tax_amount: 47.6, p_gross_amount: 298.1, p_prefix: 'RE' })
    expect(db.invoices[0].status).toBe('offen')
  })

  it('Ohne Zahlungsziel wird Rechnungsdatum + 14 Tage gesetzt (unabhängig von der Zeitzone des Servers)', async () => {
    await anlegen({ positions: [pos(1, 100)], invoice_date: '2026-11-09' })
    expect(rpcAufrufe[0].params.p_due_date).toBe('2026-11-23')
  })

  it('Kunde wird vom Projekt übernommen', async () => {
    freigabe()
    await anlegen({ positions: [pos(1, 100)], project_id: P1 })
    expect(rpcAufrufe[0].params.p_customer_id).toBe('c1')
  })

  it('Gutschrift wird mit negativem Betrag und eigenem Nummernkreis GS gebucht', async () => {
    await anlegen({ positions: [pos(1, 200)], invoice_type: 'gutschrift' })
    expect(rpcAufrufe[0].params).toMatchObject({ p_prefix: 'GS', p_net_amount: -200, p_gross_amount: -238, p_invoice_type: 'gutschrift' })
  })

  it('Ohne Kundenname oder ohne Position wird abgelehnt, ohne Nummer zu vergeben', async () => {
    expect((await anlegen({ customer_name: '', positions: [pos(1, 1)] })).status).toBe(400)
    expect((await anlegen({ positions: [] })).status).toBe(400)
    expect(rpcAufrufe).toHaveLength(0)
  })

  it('Nur Admin und Disposition dürfen Rechnungen anlegen', async () => {
    ctx.rolle = 'bauleiter'
    expect((await anlegen({ positions: [pos(1, 100)] })).status).toBe(403)
    expect(rpcAufrufe).toHaveLength(0)
  })

  it('Projekt ohne freigegebene Prüfung: 409, mit Begründung überschreibbar und protokolliert', async () => {
    const ohne = await anlegen({ positions: [pos(1, 100)], project_id: P1 })
    expect(ohne.status).toBe(409)
    expect(rpcAufrufe).toHaveLength(0)
    const mit = await anlegen({ positions: [pos(1, 100)], project_id: P1, override_grund: 'Prüfung folgt, Kunde drängt' })
    expect(mit.status).toBe(200)
    expect(db.invoice_freigabe_override).toHaveLength(1)
    expect(db.invoice_freigabe_override[0].grund).toBe('Prüfung folgt, Kunde drängt')
  })

  it('Mit freigegebener Prüfung geht es ohne Überschreibung', async () => {
    freigabe()
    const r = await anlegen({ positions: [pos(1, 100)], project_id: P1 })
    expect(r.status).toBe(200)
    expect(db.invoice_freigabe_override).toHaveLength(0)
  })

  it('Abschlagsrechnung ohne Auftrag wird abgelehnt', async () => {
    const r = await anlegen({ positions: [pos(1, 100)], invoice_type: 'abschlag' })
    expect(r.status).toBe(409)
    expect(rpcAufrufe).toHaveLength(0)
  })

  it('Neue Version: alte Rechnung wird im selben Schritt storniert, neue ist offen', async () => {
    const erste = await anlegen({ positions: [pos(1, 100)] })
    const alt = (await erste.json()).invoice.id
    const neu = await anlegen({ positions: [pos(1, 120)], replace_invoice_id: alt })
    expect(neu.status).toBe(200)
    expect(rpcAufrufe[1].name).toBe('create_invoice_as_new_version')
    expect(db.invoices.find((i) => i.id === alt)?.status).toBe('storniert')
    expect(db.invoices.filter((i) => i.status === 'offen')).toHaveLength(1)
  })

  // --- früher gefundene Lücken (behoben) -------------------------------

  it('Gutschrift über dieselben Positionen hat genau die gespiegelte Steuer der Rechnung (heute weicht sie bei halben Cent um 1 Cent ab)', async () => {
    await anlegen({ positions: [pos(1, 10.5)] })
    await anlegen({ positions: [pos(1, 10.5)], invoice_type: 'gutschrift' })
    const re = rpcAufrufe[0].params
    const gs = rpcAufrufe[1].params
    expect(gs.p_tax_amount).toBe(-(re.p_tax_amount as number))
    expect(gs.p_gross_amount).toBe(-(re.p_gross_amount as number))
  })
})
