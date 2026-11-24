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
let db: Tabellen
beforeEach(() => {
  rolle = 'admin'
  db = { employees: [{ id: E1 }], employee_personal: [{ employee_id: E1, steuerklasse: 3, sv_nummer: '12010190A123' }], employee_konditionen: [], employee_urlaubsanspruch: [], employee_sonderzahlungen: [] }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const route = () => import('@/app/api/mitarbeiter-konditionen/route')
const post = async (b: unknown) => (await route()).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never)
const get = async () => (await route()).GET(new Request('http://x/api/mitarbeiter-konditionen?employee_id=' + E1) as never)

describe('Route Lohn-Konditionen', () => {
  it('speichert Eintritt/Kündigungsfrist, ohne andere Stammdaten zu überschreiben', async () => {
    expect((await post({ typ: 'konditionen', employee_id: E1, eintrittsdatum: '2026-03-01', kuendigungsfrist: '4 Wochen', probezeit_ende: '2026-09-01' })).status).toBe(200)
    expect(db.employee_personal).toHaveLength(1)
    expect(db.employee_personal[0]).toMatchObject({ eintrittsdatum: '2026-03-01', steuerklasse: 3, sv_nummer: '12010190A123' })
    const j = await (await get()).json()
    expect(j).toMatchObject({ eintrittsdatum: '2026-03-01', konditionen: { kuendigungsfrist: '4 Wochen', probezeit_ende: '2026-09-01' } })
  })
  it('Urlaubsanspruch mit Verlauf; derselbe Tag ersetzt', async () => {
    await post({ typ: 'urlaub', employee_id: E1, tage_pro_jahr: '26', gueltig_ab: '2026-01-01' })
    await post({ typ: 'urlaub', employee_id: E1, tage_pro_jahr: '28', gueltig_ab: '2026-07-01' })
    await post({ typ: 'urlaub', employee_id: E1, tage_pro_jahr: '27', gueltig_ab: '2026-07-01' })
    const j = await (await get()).json()
    expect(j.urlaub.map((u: any) => [u.gueltig_ab, u.tage_pro_jahr])).toEqual([['2026-07-01', 27], ['2026-01-01', 26]])
  })
  it('Sonderzahlungen: anlegen, nach Monat sortiert liefern, löschen', async () => {
    await post({ typ: 'sonderzahlung', employee_id: E1, art: 'urlaubsgeld', monat: '2026-06', betrag: '500' })
    await post({ typ: 'sonderzahlung', employee_id: E1, art: 'weihnachtsgeld', monat: '2026-11' })
    const j = await (await get()).json()
    expect(j.sonderzahlungen.map((s: any) => [s.art, s.monat, s.betrag])).toEqual([['weihnachtsgeld', '2026-11', null], ['urlaubsgeld', '2026-06', 500]])
    const id = '55555555-5555-4555-8555-555555555555'
    ;(db.employee_sonderzahlungen[0] as any).id = id
    const del = (await route()).DELETE(new Request(`http://x/d?typ=sonderzahlung&id=${id}`, { method: 'DELETE' }) as never)
    expect((await del).status).toBe(200)
    expect(db.employee_sonderzahlungen).toHaveLength(1)
  })
  it('lehnt Ungültiges ab und kennt unbekannte Mitarbeiter nicht', async () => {
    expect((await post({ typ: 'sonderzahlung', employee_id: E1, art: 'praemie', monat: '2026-14' })).status).toBe(400)
    expect((await post({ typ: 'urlaub', employee_id: E1, tage_pro_jahr: '0', gueltig_ab: '2026-01-01' })).status).toBe(400)
    expect((await post({ typ: 'konditionen', employee_id: E1, eintrittsdatum: 'x' })).status).toBe(400)
    expect((await post({ typ: 'egal', employee_id: E1 })).status).toBe(400)
    expect((await post({ typ: 'urlaub', employee_id: '22222222-2222-4222-8222-222222222222', tage_pro_jahr: '30', gueltig_ab: '2026-01-01' })).status).toBe(404)
    expect(db.employee_urlaubsanspruch).toHaveLength(0); expect(db.employee_sonderzahlungen).toHaveLength(0)
  })
  it('nur der Chef', async () => {
    for (const r of ['disponent', 'bauleiter', 'mitarbeiter', 'lager']) {
      rolle = r
      expect((await get()).status).toBe(403)
      expect((await post({ typ: 'sonderzahlung', employee_id: E1, art: 'praemie', monat: '2026-06' })).status).toBe(403)
      const del = await (await route()).DELETE(new Request('http://x/d?typ=urlaub&id=33333333-3333-4333-8333-333333333333', { method: 'DELETE' }) as never)
      expect(del.status).toBe(403)
    }
    expect(db.employee_sonderzahlungen).toHaveLength(0)
  })
})
