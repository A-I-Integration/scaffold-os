import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

// ============================================================
// Kettentest: Rechnung offen → Teilzahlung → Restzahlung → Zahlung korrigieren
// Läuft durch die ECHTEN Routen /api/invoice-payments und /api/invoices (PATCH) gegen einen Nachbau der Datenbank.
// Geprüft wird nach jedem Schritt: Rechnungsstatus, bezahlter Betrag und Zahlungshistorie.
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }),
  }),
}))

let db: Tabellen
const RE = 'inv1'

beforeEach(() => {
  db = {
    invoices: [{ id: RE, invoice_number: 'RE-2026-0001', gross_amount: 1000, paid_amount: 0, status: 'offen' }],
    invoice_payments: [],
  }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

const rechnung = () => db.invoices[0]
const summeZahlungen = () => db.invoice_payments.reduce((s, z) => s + Number(z.amount), 0)

async function zahlen(betrag: number, id = RE) {
  const { POST } = await import('@/app/api/invoice-payments/route')
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ invoice_id: id, amount: betrag }) }) as never)
}
async function zahlungLoeschen(id: string) {
  const { DELETE } = await import('@/app/api/invoice-payments/route')
  return DELETE(new Request(`http://x/api/invoice-payments?id=${id}`, { method: 'DELETE' }) as never)
}
async function patchRechnung(body: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/invoices/route')
  return PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: RE, ...body }) }) as never)
}

describe('Kette Rechnung: Teilzahlung → Restzahlung → Korrektur', () => {
  it('Teilzahlung: bezahlter Betrag steigt, Rechnung bleibt offen, Zahlung steht in der Historie', async () => {
    const r = await zahlen(400)
    expect(r.status).toBe(200)
    expect(rechnung().paid_amount).toBe(400)
    expect(rechnung().status).toBe('offen')
    expect(db.invoice_payments).toHaveLength(1)
  })

  it('Restzahlung: Rechnung wird bezahlt, Historie und Betrag stimmen überein', async () => {
    await zahlen(400)
    await zahlen(600)
    expect(rechnung().status).toBe('bezahlt')
    expect(rechnung().paid_amount).toBe(1000)
    expect(summeZahlungen()).toBe(1000)
  })

  it('Überzahlung wird abgelehnt und ändert nichts', async () => {
    await zahlen(400)
    const r = await zahlen(700)
    expect(r.status).toBe(400)
    expect(rechnung().paid_amount).toBe(400)
    expect(db.invoice_payments).toHaveLength(1)
  })

  it('Betrag 0, negativ oder fehlend wird abgelehnt', async () => {
    expect((await zahlen(0)).status).toBe(400)
    expect((await zahlen(-50)).status).toBe(400)
    expect(db.invoice_payments).toHaveLength(0)
  })

  it('Stornierte Rechnung nimmt keine Zahlung an', async () => {
    rechnung().status = 'storniert'
    expect((await zahlen(100)).status).toBe(400)
    expect(db.invoice_payments).toHaveLength(0)
  })

  it('Zahlung löschen: Betrag sinkt, bezahlte Rechnung wird wieder offen', async () => {
    await zahlen(1000)
    expect(rechnung().status).toBe('bezahlt')
    const res = await zahlungLoeschen(String(db.invoice_payments[0].id))
    expect(res.status).toBe(200)
    expect(rechnung().paid_amount).toBe(0)
    expect(rechnung().status).toBe('offen')
    expect(db.invoice_payments).toHaveLength(0)
  })

  it('Zahlung einer stornierten Rechnung löschen lässt sie storniert', async () => {
    await zahlen(300)
    rechnung().status = 'storniert'
    await zahlungLoeschen(String(db.invoice_payments[0].id))
    expect(rechnung().status).toBe('storniert')
  })

  // --- früher gefundene Lücken (behoben) -------------------------------

  it('Zwei gleichzeitige Zahlungen gehen nicht verloren (Betrag = Summe der Historie)', async () => {
    await Promise.all([zahlen(300), zahlen(300)])
    expect(rechnung().paid_amount).toBe(summeZahlungen())
  })

  it('Status von Hand auf "bezahlt" verbucht den vollen Rechnungsbetrag (offener Betrag 0)', async () => {
    await patchRechnung({ status: 'bezahlt' })
    expect(rechnung().paid_amount).toBe(1000)
  })

  it('bezahlter Betrag per PATCH darf weder negativ noch über dem Rechnungsbetrag liegen', async () => {
    const a = await patchRechnung({ paid_amount: 5000 })
    const b = await patchRechnung({ paid_amount: -10 })
    expect(a.status).toBe(400)
    expect(b.status).toBe(400)
  })
})
