import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'

// ============================================================
// Mahn-Cron bei vielen Rechnungen: PostgREST liefert je Anfrage höchstens 1000 Zeilen.
// Der Nachbau unten verhält sich genauso (Obergrenze, Sortierung nach id, id=gt.…).
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.RESEND_API_KEY = 're_test'
process.env.CRON_SECRET = 'geheim'

const mail = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: mail.send } } }))
// PDF-Erzeugung ist hier nicht Gegenstand (und würde 1000+ Mal laufen)
vi.mock('@/lib/invoice-pdf', () => {
  const doc = { output: () => new ArrayBuffer(8) }
  return { generateMahnungPDF: () => doc, generateZahlungserinnerungPDF: () => doc }
})

const TAG = 86400000
const vorTagen = (n: number) => new Date(Date.now() - n * TAG).toISOString().slice(0, 10)
const MAX_ZEILEN = 1000
let db: Tabellen
let echteMails = 0

function postgrestMitObergrenze(daten: Tabellen) {
  const fake = baueFakeRest(daten)
  return async (eingabe: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(eingabe))
    // Bei gleichzeitigen ersten Aufrufen löst Vitest den dynamischen Import von 'resend' teils zum echten SDK auf; dessen
    // Anfrage landet hier. Sie wird mitgezählt, damit die Zahl der Mails stimmt (kein Fehler im Produktivcode).
    if (u.host.includes('resend')) { echteMails++; return new Response(JSON.stringify({ id: 'x' }), { status: 200 }) }
    if ((init?.method ?? 'GET') === 'GET' && u.pathname.endsWith('/rest/v1/invoices') && u.searchParams.has('status')) {
      const nach = u.searchParams.get('id')?.replace(/^gt\./, '')
      const limit = Math.min(Number(u.searchParams.get('limit')) || MAX_ZEILEN, MAX_ZEILEN)
      const treffer = daten.invoices
        .filter((z) => ['offen', 'ueberfaellig'].includes(String(z.status)) && z.invoice_type !== 'gutschrift')
        .filter((z) => !nach || String(z.id) > nach)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .slice(0, limit)
      return new Response(JSON.stringify(treffer.map((z) => ({ ...z }))), { status: 200 })
    }
    if (u.pathname.endsWith('/rest/v1/invoices') && u.searchParams.has('id') && (init?.method ?? 'GET') !== 'GET') {
      // bedingtes PATCH (Vorab-Sicherung): id=eq.… wie gehabt
      return fake(eingabe, init)
    }
    return fake(eingabe, init)
  }
}

const rechnung = (i: number) => ({
  id: `inv-${String(i).padStart(5, '0')}`, invoice_number: `RE-${i}`, customer_id: 'c1', customer_name: 'Muster GmbH', invoice_type: 'standard',
  due_date: vorTagen(20), gross_amount: 100, paid_amount: 0, status: 'offen', reminder_level: 0, erinnerung_am: null,
})

const lauf = async () => {
  const { GET } = await import('@/app/api/cron/mahnwesen/route')
  return (await GET(new Request('http://x', { headers: { authorization: 'Bearer geheim' } }) as never)).json()
}

beforeEach(async () => {
  // Module vorab laden: gleichzeitiges erstes Laden (dynamischer Import) umgeht sonst die Mail-Attrappe
  await import('resend'); await import('@/lib/mahnung-versand'); await import('@/app/api/cron/mahnwesen/route')
  echteMails = 0
  mail.send.mockReset()
  mail.send.mockResolvedValue({ error: null })
  db = { invoices: [], customers: [{ id: 'c1', name: 'Muster GmbH', email: 'kunde@test.de' }], email_log: [], company_settings: [{ mahnung_pauschale: 5, mahnung_verzugszinssatz: 10, mahnung_erinnerung_tage: null }] }
  vi.stubGlobal('fetch', postgrestMitObergrenze(db))
  vi.useRealTimers()
})

describe('Mahn-Cron mit mehr als 1000 offenen Rechnungen', () => {
  it('mahnt ALLE fälligen Rechnungen, nicht nur die ersten 1000', async () => {
    db.invoices = Array.from({ length: 1230 }, (_, i) => rechnung(i + 1))
    const a = await lauf()
    expect(a.versendet).toHaveLength(1230)
    expect(a.abgebrochen).toBe(false)
    expect(mail.send).toHaveBeenCalledTimes(1230)
    expect(db.invoices.every((r) => r.reminder_level === 1)).toBe(true)
    // zweiter Lauf am selben Tag: niemand wird doppelt gemahnt
    const b = await lauf()
    expect(b.versendet).toHaveLength(0)
    expect(mail.send).toHaveBeenCalledTimes(1230)
  }, 60000)

  it('Zeitbudget: bei Zeitnot wird sauber abgebrochen, der Rest kommt am nächsten Lauf dran', async () => {
    db.invoices = Array.from({ length: 30 }, (_, i) => rechnung(i + 1))
    vi.useFakeTimers({ toFake: ['Date'] })
    let gesendet = 0
    mail.send.mockImplementation(async () => {
      gesendet++
      if (gesendet === 10) vi.setSystemTime(Date.now() + 200_000)   // Funktionslaufzeit fast aufgebraucht
      return { error: null }
    })
    const a = await lauf()
    expect(a.abgebrochen).toBe(true)
    expect(a.versendet).toHaveLength(10)
    vi.useRealTimers()
    mail.send.mockResolvedValue({ error: null })
    const b = await lauf()
    expect(b.abgebrochen).toBe(false)
    expect(b.versendet).toHaveLength(20)
    expect(db.invoices.every((r) => r.reminder_level === 1)).toBe(true)
    expect(mail.send).toHaveBeenCalledTimes(30)
  })

  it('zwei Cron-Läufe gleichzeitig mahnen jede Rechnung nur einmal', async () => {
    db.invoices = Array.from({ length: 50 }, (_, i) => rechnung(i + 1))
    const [a, b] = await Promise.all([lauf(), lauf()])
    expect(a.versendet.length + b.versendet.length).toBe(50)
    expect(mail.send.mock.calls.length + echteMails).toBe(50)
    expect(db.invoices.every((r) => r.reminder_level === 1)).toBe(true)
  })
})
