import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { pruefeAbrechnung, grundGueltig, type PruefRechnung } from '@/lib/abrechnung-pruefung'
import { baueHistorieZeile } from '@/lib/abrechnung-historie'
import { fetchRechnungAnlegen } from '@/lib/rechnung-anlegen-client'

const r = (o: Partial<PruefRechnung>): PruefRechnung => ({ id: 'x', invoice_number: 'RE-1', invoice_type: 'standard', status: 'offen', net_amount: 0, invoice_date: '2026-11-01', ...o })
const quelle = (p: string) => readFileSync(p, 'utf8')

describe('pruefeAbrechnung', () => {
  it('innerhalb des Auftragswerts: keine Abweichung', () => {
    expect(pruefeAbrechnung({ art: 'abschlag', netto: 700, auftragswert: 1000, bestehende: [] })).toEqual([])
  })
  it('Überschreitung des Auftragswerts wird gemeldet, offene Nachträge werden erklärt', () => {
    const a = pruefeAbrechnung({ art: 'standard', netto: 400, auftragswert: 1000, nachtraegeOffen: 250, bestehende: [r({ net_amount: 700 })] })
    expect(a.map((x) => x.code)).toEqual(['UEBER_AUFTRAGSWERT'])
    expect(a[0].betrag).toBe(100)
    expect(a[0].text).toContain('nicht bestätigte Nachträge')
  })
  it('Rundungstoleranz von 1 € wird nicht gemeldet', () => {
    expect(pruefeAbrechnung({ art: 'schluss', netto: 300.5, auftragswert: 1000, bestehende: [r({ net_amount: 700 })] })).toEqual([])
  })
  it('stornierte Rechnungen und die ersetzte Version zählen nicht', () => {
    const best = [r({ id: 'alt', net_amount: 700 }), r({ id: 's', status: 'storniert', net_amount: 900 })]
    expect(pruefeAbrechnung({ art: 'standard', netto: 700, auftragswert: 1000, bestehende: best, ersetzteId: 'alt' })).toEqual([])
  })
  it('Gutschriften mindern die bisherige Summe; eine neue Gutschrift wird nie geprüft', () => {
    expect(pruefeAbrechnung({ art: 'standard', netto: 400, auftragswert: 1000, bestehende: [r({ net_amount: 700 }), r({ invoice_type: 'gutschrift', net_amount: -200 })] })).toEqual([])
    expect(pruefeAbrechnung({ art: 'gutschrift', netto: -5000, auftragswert: 1000, bestehende: [] })).toEqual([])
  })
  it('zweite Schlussrechnung und Abschlag nach Schluss', () => {
    const best = [r({ invoice_type: 'schluss', net_amount: 300, invoice_number: 'RE-9' })]
    expect(pruefeAbrechnung({ art: 'schluss', netto: 0.01, auftragswert: 0, bestehende: best }).map((x) => x.code)).toContain('DOPPELTE_SCHLUSSRECHNUNG')
    expect(pruefeAbrechnung({ art: 'abschlag', netto: 100, auftragswert: 0, bestehende: best }).map((x) => x.code)).toContain('ABSCHLAG_NACH_SCHLUSS')
  })
  it('Schlussrechnung muss die Abrechnung abschließen (Abschläge richtig berücksichtigt)', () => {
    const best = [r({ invoice_type: 'abschlag', net_amount: 700 })]
    expect(pruefeAbrechnung({ art: 'schluss', netto: 300, auftragswert: 1000, bestehende: best })).toEqual([])
    const doppelt = pruefeAbrechnung({ art: 'schluss', netto: 1000, auftragswert: 1000, bestehende: best })
    expect(doppelt.map((x) => x.code)).toEqual(['UEBER_AUFTRAGSWERT'])
    const zuWenig = pruefeAbrechnung({ art: 'schluss', netto: 200, auftragswert: 1000, bestehende: best })
    expect(zuWenig.map((x) => x.code)).toEqual(['SCHLUSS_SCHLIESST_NICHT'])
    expect(zuWenig[0].betrag).toBe(100)
  })
  it('unbekannter Auftragswert (0): keine Betragsprüfung', () => {
    expect(pruefeAbrechnung({ art: 'schluss', netto: 99999, auftragswert: 0, bestehende: [] })).toEqual([])
  })
  it('gleichartige Rechnung mit gleichem Betrag und Datum wird als mögliche Dublette gemeldet', () => {
    const a = pruefeAbrechnung({ art: 'standard', netto: 100, auftragswert: 0, bestehende: [r({ net_amount: 100 })], rechnungsdatum: '2026-11-01' })
    expect(a.map((x) => x.code)).toEqual(['GLEICHER_BETRAG'])
    expect(pruefeAbrechnung({ art: 'standard', netto: 100, auftragswert: 0, bestehende: [r({ net_amount: 100 })], rechnungsdatum: '2026-11-02' })).toEqual([])
  })
  it('Begründung muss echt sein', () => {
    expect(grundGueltig('  ')).toBe(false); expect(grundGueltig('ok')).toBe(false); expect(grundGueltig('Nachtrag mündlich beauftragt')).toBe(true); expect(grundGueltig(undefined)).toBe(false)
  })
})

describe('Änderungsverlauf', () => {
  it('Zeile kürzt und lässt Leeres null', () => {
    const z = baueHistorieZeile({ aktion: 'rechnung_angelegt', invoiceNumber: 'RE-1', grund: '  weil  ', details: { a: 1 } })
    expect(z).toMatchObject({ aktion: 'rechnung_angelegt', invoice_number: 'RE-1', grund: 'weil', project_id: null, user_id: null })
  })
})

describe('Einbau (Quellprüfung)', () => {
  it('Server prüft vor dem Anlegen, protokolliert jede Rechnung und sperrt das Löschen versendeter Rechnungen', () => {
    const t = quelle('app/api/invoices/route.ts')
    expect(t).toContain('pruefeAbrechnung(')
    expect(t).toContain("code: 'ABRECHNUNG_ABWEICHUNG'")
    expect(t.indexOf('pruefeAbrechnung(')).toBeLessThan(t.indexOf("p_invoice_type: resolvedInvoiceType"))
    expect(t).toContain("aktion: replace_invoice_id ? 'neue_version'")
    expect(t).toContain("code: 'BEREITS_VERSENDET'")
  })
  it('Alle Stellen, die Rechnungen anlegen, laufen über die Freigabe-Abfrage', () => {
    for (const d of ['app/kunden/[id]/page.tsx', 'app/aufmass/schritt6/page.tsx', 'components/SchlussrechnungDialog.tsx', 'components/rechnungen/RechnungenInhalt.tsx', 'components/KundeAuftrag.tsx', 'app/mietabrechnung/page.tsx', 'app/rechnungen/[id]/page.tsx']) {
      const t = quelle(d)
      expect(t, d).toContain('fetchRechnungAnlegen(')
      expect(/fetch\('\/api\/invoices', \{\s*method: 'POST'/.test(t), d).toBe(false)
    }
  })
})

describe('fetchRechnungAnlegen', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const abw = { status: 409, clone() { return { json: async () => ({ code: 'ABRECHNUNG_ABWEICHUNG', error: 'Abweichung' }) } }, json: async () => ({}) }
  it('wiederholt mit Begründung, nichts ohne Begründung', async () => {
    const f = vi.fn().mockResolvedValueOnce(abw).mockResolvedValueOnce({ status: 200 })
    vi.stubGlobal('fetch', f); vi.stubGlobal('window', { prompt: () => 'Nachtrag mündlich beauftragt' })
    const res = await fetchRechnungAnlegen('/api/invoices', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    expect(res.status).toBe(200)
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ a: 1, abrechnung_grund: 'Nachtrag mündlich beauftragt' })
    const g = vi.fn().mockResolvedValue(abw); vi.stubGlobal('fetch', g); vi.stubGlobal('window', { prompt: () => null })
    const res2 = await fetchRechnungAnlegen('/api/invoices', { method: 'POST', body: '{}' })
    expect(res2.status).toBe(409); expect(g).toHaveBeenCalledTimes(1)
  })
  it('andere Fehler laufen unverändert durch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 409, clone: () => ({ json: async () => ({ code: 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH' }) }) }))
    const res = await fetchRechnungAnlegen('/api/invoices', { method: 'POST', body: '{}' })
    expect(res.status).toBe(409)
  })
})
