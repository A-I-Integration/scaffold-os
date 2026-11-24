import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
let rolle = 'admin'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: rolle } }) }) }) }),
  }),
}))

const E1 = '11111111-1111-4111-8111-111111111111'
const t = (h: string) => `2026-11-10T${h}:00+01:00`
const satz = (regelwerk: string, schluessel: string, wert: number) => ({ regelwerk, schluessel, wert, gueltig_ab: '2021-04-01' })
let db: Tabellen
beforeEach(() => {
  rolle = 'admin'
  db = {
    spesen_tage: [], zeit_abschnitte: [],
    time_entries: [{ id: 'z1', employee_id: E1, work_date: '2026-11-10', start_time: t('06:00'), end_time: t('17:00'), hours: 10.25, break_minutes: 45 }],
    spesen_saetze: [satz('tarif', 'verpflegung_heimfahrt', 3.5), satz('tarif', 'verpflegung_schwelle_stunden', 10), satz('tarif', 'ausloesung_voll', 24), satz('tarif', 'ausloesung_an_abreise', 12),
      satz('steuer', 'pauschale_ueber_8h', 14), satz('steuer', 'pauschale_schwelle_stunden', 8), satz('steuer', 'pauschale_24h', 28), satz('steuer', 'pauschale_an_abreise', 14),
      satz('steuer', 'kuerzung_fruehstueck_prozent', 20), satz('steuer', 'kuerzung_mittag_prozent', 40), satz('steuer', 'kuerzung_abend_prozent', 40), satz('betrieb', 'auszahlung_monate_versatz', 1)],
  }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const route = () => import('@/app/api/spesen/route')
const post = async (b: unknown) => (await route()).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never)
const get = async (q: string) => (await route()).GET(new Request('http://x/api/spesen?' + q) as never)
const tag = { employee_id: E1, work_date: '2026-11-10' }

describe('Route Spesen', () => {
  it('berechnet aus der Stempelzeit (11 h → 3,50 €) und speichert mit Begründung', async () => {
    const r = await post(tag)
    expect(r.status).toBe(200)
    expect(db.spesen_tage).toHaveLength(1)
    expect(db.spesen_tage[0]).toMatchObject({ einsatzart: 'heimfahrt', vorschlag_tarif: 3.5, vorschlag_steuer: 14, abwesenheit_stunden: 11 })
    expect(String(db.spesen_tage[0].begruendung)).toContain('§ 7 Nr. 3.2')
  })
  it('erneutes Speichern aktualisiert den Tag; manueller Betrag bleibt neben dem Vorschlag', async () => {
    await post(tag)
    await post({ ...tag, einsatzart: 'auswaerts_voll', betrag_manuell: '20,5' })
    expect(db.spesen_tage).toHaveLength(1)
    expect(db.spesen_tage[0]).toMatchObject({ einsatzart: 'auswaerts_voll', vorschlag_tarif: 24, betrag_manuell: 20.5 })
  })
  it('Fortbildung am Tag: keine Zulagen', async () => {
    db.zeit_abschnitte.push({ id: 'a1', employee_id: E1, work_date: '2026-11-10', art: 'fortbildung', start_time: t('08:00'), end_time: t('12:00') })
    await post({ ...tag, einsatzart: 'auswaerts_voll' })
    expect(db.spesen_tage[0]).toMatchObject({ vorschlag_tarif: 0, vorschlag_steuer: 0 })
  })
  it('lehnt Ungültiges ab', async () => {
    for (const b of [{ ...tag, employee_id: 'x' }, { ...tag, work_date: '2026-13-40' }, { ...tag, einsatzart: 'x' }, { ...tag, betrag_manuell: '-3' }, { ...tag, abwesenheit_stunden: '30' }]) expect((await post(b)).status).toBe(400)
    expect(db.spesen_tage).toHaveLength(0)
  })
  it('Monatsliste mit Auszahlungsmonat Folgemonat', async () => {
    await post(tag)
    const j = await (await get('monat=2026-11')).json()
    expect(j.tage).toHaveLength(1); expect(j.auszahlung).toBe('2026-12')
  })
  it('nur Chef und Dispo', async () => {
    for (const r of ['bauleiter', 'mitarbeiter', 'lager']) { rolle = r; expect((await get('datum=2026-11-10')).status).toBe(403); expect((await post(tag)).status).toBe(403) }
    rolle = 'disponent'; expect((await post(tag)).status).toBe(200)
    expect(db.spesen_tage).toHaveLength(1)
  })
  it('meldet fehlende Tabelle statt Fehler', async () => {
    const rest = baueFakeRest(db)
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('spesen_') ? new Response('relation "public.spesen_saetze" does not exist', { status: 404 }) : rest(u, i))
    const j = await (await get('datum=2026-11-10')).json()
    expect(j.tabelleFehlt).toBe(true)
  })
})

describe('Route Spesensätze', () => {
  const sr = () => import('@/app/api/spesen-saetze/route')
  const sp = async (b: unknown) => (await sr()).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never)
  it('Chef legt neue Fassung an, alte bleibt; Dispo darf nicht', async () => {
    expect((await sp({ regelwerk: 'tarif', schluessel: 'ausloesung_voll', wert: '26', gueltig_ab: '2027-01-01' })).status).toBe(200)
    expect(db.spesen_saetze.filter((s: any) => s.schluessel === 'ausloesung_voll')).toHaveLength(2)
    expect((await sp({ regelwerk: 'tarif', schluessel: 'gibtsnicht', wert: '1', gueltig_ab: '2027-01-01' })).status).toBe(400)
    expect((await sp({ regelwerk: 'tarif', schluessel: 'ausloesung_voll', wert: '', gueltig_ab: '2027-01-01' })).status).toBe(400)
    rolle = 'disponent'
    expect((await sp({ regelwerk: 'tarif', schluessel: 'ausloesung_voll', wert: '27', gueltig_ab: '2028-01-01' })).status).toBe(403)
  })
})
