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

// Die Datenbankfunktionen faktura_zahlung_buchen / faktura_zahlung_loeschen (supabase/phase-129) laufen hier NICHT (kein PostgreSQL im Nachbau).
// Dieser Nachbau gibt ihre Regeln wieder, gerechnet mit lib/forderung.ts; die echten SQL-Funktionen prüft der E2E-Test gegen PostgreSQL
// (inkl. Paritätstest SQL = lib/forderung.ts und paralleler Buchungen).
function mitRpc(fake: (e: RequestInfo | URL, i?: RequestInit) => Promise<Response>) {
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 })
  return async (e: RequestInfo | URL, init?: RequestInit) => {
    const u = String(e)
    if (!u.includes('/rest/v1/rpc/')) return fake(e, init)
    const name = u.split('/rpc/')[1]; const b = JSON.parse(String(init?.body ?? '{}'))
    const { berechneForderung } = await import('@/lib/forderung')
    const offenVon = (inv: any, paid: number, status: string) => berechneForderung([{ ...inv, paid_amount: paid, status }, ...db.invoices.filter((g) => g.invoice_type === 'gutschrift' && g.reference_invoice_number === inv.invoice_number)] as never).je.get(String(inv.id)) ?? 0
    if (name === 'faktura_zahlung_buchen') {
      const inv = db.invoices.find((x) => x.id === b.p_invoice_id); if (!inv) return json({ ok: false, code: 'NICHT_GEFUNDEN' })
      if (inv.status === 'storniert') return json({ ok: false, code: 'ZAHLUNG_AUF_STORNIERT' })
      const offen = offenVon(inv, Number(inv.paid_amount), String(inv.status))
      if (b.p_amount - offen > 0.01) return json({ ok: false, code: 'UEBER_OFFEN', offen, gutschrift: 0 })
      const neu = Math.round((Number(inv.paid_amount) + b.p_amount) * 100) / 100; const voll = offen - b.p_amount <= 0.01
      db.invoice_payments.push({ id: crypto.randomUUID(), invoice_id: inv.id, amount: b.p_amount, payment_date: b.p_payment_date, note: b.p_note })
      inv.paid_amount = neu; inv.status = voll ? 'bezahlt' : inv.status === 'bezahlt' ? 'offen' : inv.status
      return json({ ok: true, paid_amount: neu, vollstaendig_bezahlt: voll })
    }
    if (name === 'faktura_zahlung_loeschen') {
      const z = db.invoice_payments.find((x) => x.id === b.p_payment_id); if (!z) return json({ ok: false, code: 'NICHT_GEFUNDEN' })
      const inv = db.invoices.find((x) => x.id === z.invoice_id)!
      db.invoice_payments = db.invoice_payments.filter((x) => x.id !== z.id)
      const neu = Math.max(0, Math.round((Number(inv.paid_amount) - Number(z.amount)) * 100) / 100)
      if (inv.status !== 'storniert') inv.status = neu > 0 && offenVon(inv, neu, inv.status === 'bezahlt' ? 'offen' : String(inv.status)) <= 0.01 ? 'bezahlt' : inv.status === 'bezahlt' ? 'offen' : inv.status
      inv.paid_amount = neu
      return json({ ok: true })
    }
    if (name === 'faktura_status_setzen') {
      // Regeln von faktura_status_setzen (phase-130); die echte SQL-Funktion prüft der E2E-Test gegen PostgreSQL (Gruppe 8d)
      const inv = db.invoices.find((x) => x.id === b.p_invoice_id); if (!inv) return json({ ok: false, code: 'NICHT_GEFUNDEN' })
      if (inv.status === 'storniert') return json({ ok: false, code: b.p_ziel === 'bezahlt' ? 'ZAHLUNG_AUF_STORNIERT' : 'STORNIERT_FINAL' })
      if (b.p_ziel === 'bezahlt') {
        const offen = offenVon(inv, Number(inv.paid_amount), String(inv.status))
        if (offen > 0.01) {
          db.invoice_payments.push({ id: crypto.randomUUID(), invoice_id: inv.id, amount: offen, quelle: 'manuell_bezahlt' })
          inv.paid_amount = Math.round((Number(inv.paid_amount) + offen) * 100) / 100; inv.status = 'bezahlt'
          return json({ ok: true, status: 'bezahlt', gebucht: offen, paid_amount: inv.paid_amount })
        }
        return json({ ok: true, status: inv.status, gebucht: 0 })
      }
      if (db.invoice_payments.some((x) => x.invoice_id === inv.id && x.quelle !== 'manuell_bezahlt')) return json({ ok: false, code: 'ZAHLUNGEN_VORHANDEN' })
      db.invoice_payments = db.invoice_payments.filter((x) => x.invoice_id !== inv.id); inv.paid_amount = 0; inv.status = 'offen'
      return json({ ok: true, status: 'offen' })
    }
    return new Response('rpc unbekannt', { status: 404 })
  }
}

beforeEach(() => {
  db = {
    invoices: [{ id: RE, invoice_number: 'RE-2026-0001', gross_amount: 1000, paid_amount: 0, status: 'offen' }],
    invoice_payments: [],
  }
  vi.stubGlobal('fetch', mitRpc(baueFakeRest(db)))
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
    expect((await zahlen(100)).status).toBe(409)
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

  it('Datenbank-Migration phase-129 fehlt: 503 mit klarer Meldung, nichts gebucht', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.faktura_zahlung_buchen' }), { status: 404 }))
    const r = await zahlen(100)
    expect(r.status).toBe(503); expect((await r.json()).code).toBe('BUCHUNG_MIGRATION_FEHLT')
    expect(db.invoice_payments).toHaveLength(0); expect(rechnung().paid_amount).toBe(0)
  })

  it('Zwei gleichzeitige Zahlungen gehen nicht verloren (Betrag = Summe der Historie)', async () => {
    await Promise.all([zahlen(300), zahlen(300)])
    expect(rechnung().paid_amount).toBe(summeZahlungen())
  })

  it('Status von Hand auf "bezahlt" bucht den offenen Rest als echte Zahlung (Betrag = Summe der Historie); ein mitgesendeter Betrag wird ignoriert', async () => {
    const r = await patchRechnung({ status: 'bezahlt', paid_amount: 5 })
    expect(r.status).toBe(200)
    expect(rechnung().paid_amount).toBe(1000); expect(summeZahlungen()).toBe(1000); expect(db.invoice_payments).toHaveLength(1)
  })

  it('bezahlter Betrag per PATCH allein wird nicht mehr gesetzt (400), nichts verändert', async () => {
    const a = await patchRechnung({ paid_amount: 500 })
    expect(a.status).toBe(400); expect((await a.json()).code).toBe('PAID_AMOUNT_NICHT_ERLAUBT')
    expect(rechnung().paid_amount).toBe(0); expect(db.invoice_payments).toHaveLength(0)
  })

  it('"Zurück auf offen" bei echter Zahlung: 409, Zahlung bleibt', async () => {
    await zahlen(400)
    const r = await patchRechnung({ status: 'offen' })
    expect(r.status).toBe(409); expect((await r.json()).code).toBe('ZAHLUNGEN_VORHANDEN')
    expect(rechnung().paid_amount).toBe(400)
  })

  it('Datenbank-Migration phase-130 fehlt: Status-Änderung 503, nichts geändert', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.faktura_status_setzen' }), { status: 404 }))
    const r = await patchRechnung({ status: 'bezahlt' })
    expect(r.status).toBe(503); expect((await r.json()).code).toBe('STATUS_MIGRATION_FEHLT')
    expect(rechnung().paid_amount).toBe(0)
  })
})
