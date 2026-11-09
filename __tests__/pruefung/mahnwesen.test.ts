import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'

// ============================================================
// Tiefenprüfung Mahnwesen: Versand-Regeln, Teilzahlungen, Reihenfolge der Stufen, Cron-Lauf.
// Läuft gegen den echten Versandcode (lib/mahnung-versand) und die echte Cron-Route, mit Datenbank-Nachbau und Mail-Attrappe.
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.RESEND_API_KEY = 're_test'
process.env.CRON_SECRET = 'geheim'

const mail = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: mail.send } } }))

let db: Tabellen
const TAG = 86400000
const vorTagen = (n: number) => new Date(Date.now() - n * TAG).toISOString().slice(0, 10)

function rechnung(extra: Record<string, unknown> = {}) {
  return {
    id: 'inv1', invoice_number: 'RE-2026-0001', customer_id: 'c1', customer_name: 'Muster GmbH', invoice_type: 'rechnung',
    invoice_date: vorTagen(40), due_date: vorTagen(20), gross_amount: 1000, paid_amount: 0, status: 'offen', reminder_level: 0, erinnerung_am: null,
    company_snapshot: { company_name: 'Gerüstbau Test', iban: 'DE00' }, ...extra,
  }
}

beforeEach(() => {
  mail.send.mockReset()
  mail.send.mockResolvedValue({ error: null })
  db = { invoices: [rechnung()], customers: [{ id: 'c1', name: 'Muster GmbH', email: 'kunde@test.de' }], email_log: [], company_settings: [{ mahnung_pauschale: 5, mahnung_verzugszinssatz: 10, mahnung_erinnerung_tage: null }] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

const sende = async (aktion: 'erinnerung' | 1 | 2, id = 'inv1') => (await import('@/lib/mahnung-versand')).sendeMahnschritt(id, aktion)
const pdfText = () => Buffer.from(mail.send.mock.calls[0][0].attachments[0].content, 'base64').toString('latin1')

describe('Teilzahlung wird bei der Mahnung berücksichtigt', () => {
  it('Mail und Mahn-PDF nennen nur den offenen Betrag', async () => {
    db.invoices[0] = rechnung({ gross_amount: 1000, paid_amount: 600 })
    const r = await sende(1)
    expect(r.ok).toBe(true)
    const html = mail.send.mock.calls[0][0].html as string
    expect(html).toContain('Offener Betrag')
    expect(html).toContain('400,00')
    expect(html).not.toContain('1.000,00')
    expect(pdfText()).toContain('400,00')
  })
  it('Verzugszinsen werden auf den offenen Betrag gerechnet, nicht auf den Rechnungsbetrag', async () => {
    db.invoices[0] = rechnung({ gross_amount: 1000, paid_amount: 600, due_date: vorTagen(365) })
    await sende(1)
    // 10 % von 400 € bei 365 Tagen = 40,00 €; Gesamt 400 + 40 + 5 = 445,00 €
    const t = pdfText()
    expect(t).toContain('445,00')
    expect(t).not.toContain('1.105,00')
  })
  it('ohne Teilzahlung bleibt der volle Betrag', async () => {
    await sende(1)
    expect(mail.send.mock.calls[0][0].html).toContain('1.000,00')
  })
  it('wenn die Zahlungen den Betrag decken, wird nicht gemahnt (inkonsistenter Status)', async () => {
    db.invoices[0] = rechnung({ gross_amount: 1000, paid_amount: 1000, status: 'offen' })
    const r = await sende(1)
    expect(r).toMatchObject({ ok: false })
    expect(mail.send).not.toHaveBeenCalled()
    expect(db.invoices[0].reminder_level).toBe(0)
  })
})

describe('Regeln des Versands', () => {
  it('Gutschrift, bezahlt und storniert werden nie gemahnt', async () => {
    for (const extra of [{ invoice_type: 'gutschrift' }, { status: 'bezahlt' }, { status: 'storniert' }]) {
      db.invoices[0] = rechnung(extra)
      expect((await sende(1)).ok).toBe(false)
    }
    expect(mail.send).not.toHaveBeenCalled()
  })
  it('Stufen nur der Reihe nach: 2. Mahnung nicht vor der 1.', async () => {
    const r = await sende(2)
    expect(r).toMatchObject({ ok: false })
    expect(mail.send).not.toHaveBeenCalled()
  })
  it('1. Mahnung setzt Stufe und Status, 2. Mahnung danach möglich, 3. nicht', async () => {
    expect((await sende(1)).ok).toBe(true)
    expect(db.invoices[0]).toMatchObject({ reminder_level: 1, status: 'ueberfaellig' })
    expect((await sende(1)).ok).toBe(false) // nicht doppelt
    expect((await sende(2)).ok).toBe(true)
    expect(db.invoices[0].reminder_level).toBe(2)
    expect(mail.send).toHaveBeenCalledTimes(2)
  })
  it('Erinnerung nur einmal und nicht nach einer Mahnung; Status bleibt', async () => {
    expect((await sende('erinnerung')).ok).toBe(true)
    expect(db.invoices[0].status).toBe('offen')
    expect(db.invoices[0].erinnerung_am).toBeTruthy()
    expect((await sende('erinnerung')).ok).toBe(false)
    db.invoices[0] = rechnung({ reminder_level: 1 })
    expect((await sende('erinnerung')).ok).toBe(false)
  })
  it('ohne Fälligkeitsdatum keine Mahnung', async () => {
    db.invoices[0] = rechnung({ due_date: null })
    expect((await sende(1)).ok).toBe(false)
  })
  it('ohne Kunden-E-Mail: Hinweis, nichts gesendet, Stand unverändert', async () => {
    db.customers[0].email = null
    const r = await sende(1)
    expect(r).toMatchObject({ ok: false, ohneEmail: true })
    expect(mail.send).not.toHaveBeenCalled()
    expect(db.invoices[0].reminder_level).toBe(0)
  })
  it('Mail-Fehler: Stand bleibt unverändert, damit erneut gesendet werden kann', async () => {
    mail.send.mockResolvedValueOnce({ error: { message: 'down' } })
    expect((await sende(1)).ok).toBe(false)
    expect(db.invoices[0].reminder_level).toBe(0)
    expect((await sende(1)).ok).toBe(true)
  })
  it('Mail ging raus, Speichern schlug fehl: klare Warnung gegen Doppelversand', async () => {
    const echt = fetch
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'PATCH' ? new Response('boom', { status: 500 }) : echt(u, init))
    const r = await sende(1)
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/nicht erneut senden/i)
  })
})

describe('Cron: tägliches Mahnwesen', () => {
  const lauf = async () => {
    const { GET } = await import('@/app/api/cron/mahnwesen/route')
    return (await GET(new Request('http://x', { headers: { authorization: 'Bearer geheim' } }) as never)).json()
  }
  it('ohne Secret kein Zugriff', async () => {
    const { GET } = await import('@/app/api/cron/mahnwesen/route')
    expect((await GET(new Request('http://x') as never)).status).toBe(401)
  })
  it('mahnt fällige Rechnung nach 14 Tagen, aber nur einmal pro Lauf und Stufe', async () => {
    db.invoices[0] = rechnung({ due_date: vorTagen(15) })
    const a = await lauf()
    expect(a.versendet).toHaveLength(1)
    const b = await lauf() // gleicher Tag: keine zweite Mahnung
    expect(b.versendet).toHaveLength(0)
    expect(mail.send).toHaveBeenCalledTimes(1)
  })
  it('nach 28 Tagen folgt die 2. Mahnung, danach nichts mehr', async () => {
    db.invoices[0] = rechnung({ due_date: vorTagen(30), reminder_level: 1, status: 'ueberfaellig' })
    expect((await lauf()).versendet).toHaveLength(1)
    expect(db.invoices[0].reminder_level).toBe(2)
    expect((await lauf()).versendet).toHaveLength(0)
  })
  it('überspringt: pausiert, noch nicht fällig genug, ohne Fälligkeitsdatum', async () => {
    db.invoices = [
      rechnung({ id: 'a', mahnung_pausiert: true, due_date: vorTagen(50) }),
      rechnung({ id: 'b', due_date: vorTagen(5) }),
      rechnung({ id: 'c', due_date: null }),
    ]
    const r = await lauf()
    expect(r.versendet).toHaveLength(0)
    expect(r.uebersprungen).toBe(3)
  })
  it('meldet Rechnungen ohne E-Mail, statt still zu scheitern', async () => {
    db.invoices[0] = rechnung({ due_date: vorTagen(20) })
    db.customers[0].email = null
    const r = await lauf()
    expect(r.ohne_email).toEqual(['RE-2026-0001'])
  })
})
