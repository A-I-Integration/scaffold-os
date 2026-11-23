import { describe, it, expect, vi, afterEach } from 'vitest'
import { ladeAlleRechnungen, ListeZuGross, SEITENGROESSE } from '../forderung-server'
import { schluesselFuer, schluesselAbschliessen, fetchMitSchluessel } from '../idempotenz-client'
import { generateMahnungPDF, generateZahlungserinnerungPDF, type Invoice } from '../invoice-pdf'

// Fake-PostgREST für die Rechnungsliste: begrenzt jede Antwort wie PostgREST (SEITENGROESSE), unterstützt limit/offset und die Gutschrift-Abfrage
function fakeDb(zeilen: Record<string, any>[], opt: { fehlerBeiOffset?: number } = {}) {
  const aufrufe: string[] = []
  const fetchFn = vi.fn(async (eingabe: RequestInfo | URL) => {
    const u = new URL(String(eingabe)); aufrufe.push(u.search)
    if (opt.fehlerBeiOffset !== undefined && Number(u.searchParams.get('offset')) === opt.fehlerBeiOffset) return new Response('Datenbankfehler', { status: 500 })
    let t = zeilen.slice()
    const proj = u.searchParams.get('project_id'); if (proj) t = t.filter((z) => z.project_id === proj.replace(/^eq\./, ''))
    const typ = u.searchParams.get('invoice_type'); if (typ) t = t.filter((z) => z.invoice_type === typ.replace(/^eq\./, ''))
    const ref = u.searchParams.get('reference_invoice_number')
    if (ref) { const liste = ref.replace(/^in\.\(|\)$/g, '').split(',').map((x) => x.replace(/"/g, '')); t = t.filter((z) => liste.includes(z.reference_invoice_number)) }
    const off = Number(u.searchParams.get('offset')) || 0; const lim = Math.min(Number(u.searchParams.get('limit')) || SEITENGROESSE, SEITENGROESSE)
    return new Response(JSON.stringify(t.slice(off, off + lim)), { status: 200 })
  })
  return { fetchFn, aufrufe }
}
const C = { url: 'http://db.test', headers: {} }
const re = (i: number, extra: Record<string, any> = {}) => ({ id: `id-${i}`, invoice_number: `RE-${i}`, invoice_type: 'standard', status: 'offen', gross_amount: 119, paid_amount: 0, ...extra })

afterEach(() => { vi.unstubAllGlobals() })

describe('Rechnungsliste ohne feste Obergrenze (früher limit 3000)', () => {
  it('liefert bei 3.500 Rechnungen ALLE (4 Seiten), ohne Doppelte', async () => {
    const z = Array.from({ length: 3500 }, (_, i) => re(i))
    const { fetchFn } = fakeDb(z); vi.stubGlobal('fetch', fetchFn)
    const r = await ladeAlleRechnungen(C)
    expect(r).toHaveLength(3500); expect(new Set(r.map((x) => x.id)).size).toBe(3500)
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })
  it('entfernt Doppelte, die beim Seitenwechsel entstehen (neue Rechnung schiebt alles nach hinten)', async () => {
    const z = Array.from({ length: 1500 }, (_, i) => re(i))
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async (e: RequestInfo | URL) => { const u = new URL(String(e)); const off = Number(u.searchParams.get('offset')) || 0
      const basis = n++ === 0 ? z : [re(9999), ...z]                            // vor der 2. Seite kommt eine neue Rechnung dazu → Zeile 999 erscheint erneut
      return new Response(JSON.stringify(basis.slice(off, off + 1000)), { status: 200 }) }))
    const r = await ladeAlleRechnungen(C)
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length); expect(r.length).toBeGreaterThanOrEqual(1500)
  })
  it('Obergrenze erreicht: nie stillschweigend abschneiden, sondern ListeZuGross', async () => {
    const z = Array.from({ length: 5000 }, (_, i) => re(i))
    vi.stubGlobal('fetch', fakeDb(z).fetchFn)
    await expect(ladeAlleRechnungen(C, '', { obergrenze: 3000 })).rejects.toBeInstanceOf(ListeZuGross)
  })
  it('Lesefehler auf einer späteren Seite: Fehler statt unvollständiger Liste', async () => {
    const z = Array.from({ length: 3500 }, (_, i) => re(i))
    vi.stubGlobal('fetch', fakeDb(z, { fehlerBeiOffset: 2000 }).fetchFn)
    await expect(ladeAlleRechnungen(C)).rejects.toThrow()
  })
  it('gefilterte Liste (Baustelle): Gutschriften ohne Baustelle zu den gelieferten Rechnungen werden ergänzt – andere Rechnungen/Kunden nicht', async () => {
    const z: Record<string, any>[] = [
      re(1, { project_id: 'P' }), re(2, { project_id: 'ANDERE' }),
      { id: 'g1', invoice_number: 'GS-1', invoice_type: 'gutschrift', status: 'offen', gross_amount: -50, reference_invoice_number: 'RE-1', project_id: null },
      { id: 'g2', invoice_number: 'GS-2', invoice_type: 'gutschrift', status: 'offen', gross_amount: -50, reference_invoice_number: 'RE-2', project_id: null },
      { id: 'g3', invoice_number: 'GS-3', invoice_type: 'gutschrift', status: 'offen', gross_amount: -50, reference_invoice_number: 'GIBT-ES-NICHT', project_id: null },
    ]
    vi.stubGlobal('fetch', fakeDb(z).fetchFn)
    const r = await ladeAlleRechnungen(C, '&project_id=eq.P')
    expect(r.map((x) => x.id).sort()).toEqual(['g1', 'id-1'])                  // g2 gehört zu RE-2 (andere Baustelle), g3 hat keine Bezugsrechnung → nicht zugeordnet
  })
  it('viele Rechnungen in der Baustelle: Gutschriften werden in Paketen (je 100 Nummern) nachgeladen', async () => {
    const z: Record<string, any>[] = Array.from({ length: 250 }, (_, i) => re(i, { project_id: 'P' }))
    for (let i = 0; i < 250; i += 50) z.push({ id: `g${i}`, invoice_number: `GS-${i}`, invoice_type: 'gutschrift', status: 'offen', gross_amount: -10, reference_invoice_number: `RE-${i}`, project_id: null })
    const { fetchFn, aufrufe } = fakeDb(z); vi.stubGlobal('fetch', fetchFn)
    const r = await ladeAlleRechnungen(C, '&project_id=eq.P')
    expect(r.filter((x) => x.invoice_type === 'gutschrift')).toHaveLength(5)
    expect(aufrufe.filter((a) => a.includes('reference_invoice_number')).length).toBe(3)
  })
})

describe('Wiederholungssicherheit im Browser (Idempotency-Key)', () => {
  it('gleicher Inhalt behält den Schlüssel bis zum Abschluss; danach neuer Schlüssel; anderer Inhalt anderer Schlüssel', () => {
    const k1 = schluesselFuer('t', 'A'); expect(schluesselFuer('t', 'A')).toBe(k1); expect(schluesselFuer('t', 'B')).not.toBe(k1)
    schluesselAbschliessen('t', 'A'); expect(schluesselFuer('t', 'A')).not.toBe(k1)
  })
  it('Netzwerkfehler: Schlüssel bleibt, die Wiederholung sendet denselben; nach Erfolg neuer Schlüssel; 4xx räumt ab', async () => {
    const gesendet: string[] = []
    let schritt = 0
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      gesendet.push((init.headers as Record<string, string>)['Idempotency-Key'])
      schritt++
      if (schritt === 1) throw new TypeError('Failed to fetch')                       // Netzwerkfehler (Antwort evtl. verloren)
      if (schritt === 4) return new Response('{}', { status: 400 })
      return new Response('{}', { status: 200 })
    }))
    const send = () => fetchMitSchluessel('/api/invoice-payments', { method: 'POST', body: '{"betrag":1}' }, 'test-zahlung')
    await expect(send()).rejects.toThrow(); await send()                              // 1: Fehler, 2: gleicher Schlüssel, Erfolg
    await send()                                                                       // 3: bewusst neue Buchung → neuer Schlüssel
    const r4 = await send()                                                            // 4: 400 → abgelehnt
    await send()                                                                       // 5: nach Ablehnung neuer Schlüssel
    expect(r4.status).toBe(400)
    expect(gesendet[1]).toBe(gesendet[0]); expect(gesendet[2]).not.toBe(gesendet[0]); expect(gesendet[3]).not.toBe(gesendet[2]); expect(gesendet[4]).not.toBe(gesendet[3])
  })
})

describe('Mahn-PDF ohne Eigenberechnung', () => {
  const inv = { invoice_number: 'RE-1', gross_amount: 1190, paid_amount: 0, status: 'offen', due_date: '2026-01-01', customer_name: 'X', positions: [] } as unknown as Invoice
  it('ohne zentralen offenen Betrag wird kein Mahn-PDF/keine Erinnerung erzeugt (kein falscher Betrag)', () => {
    expect(() => generateMahnungPDF(inv, 1)).toThrow(/zentral/)
    expect(() => generateZahlungserinnerungPDF(inv)).toThrow(/zentral/)
  })
  it('mit zentralem Betrag wird erzeugt', () => {
    expect(() => generateMahnungPDF({ ...inv, offen_zentral: 595 }, 1)).not.toThrow()
    expect(() => generateZahlungserinnerungPDF({ ...inv, offen_zentral: 595 })).not.toThrow()
  })
})
