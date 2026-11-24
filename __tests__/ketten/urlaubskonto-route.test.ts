import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
let rolle = 'mitarbeiter'
let eigene: string | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => ({
      select: () => ({
        eq: (_s: string, wert: string) => ({
          single: async () => ({ data: { role: rolle } }),
          eq: () => ({ maybeSingle: async () => ({ data: eigene === wert ? { id: wert } : null }) }),
        }),
      }),
    }),
  }),
}))

const E1 = '11111111-1111-4111-8111-111111111111'
const E2 = '22222222-2222-4222-8222-222222222222'
const jetzt = new Date()
const jahr = jetzt.getFullYear()
let db: Tabellen
beforeEach(() => {
  rolle = 'mitarbeiter'; eigene = E1
  db = {
    employees: [{ id: E1, first_name: 'Max', last_name: 'Muster', status: 'active' }, { id: E2, first_name: 'Ina', last_name: 'Zweit', status: 'active' }],
    employee_personal: [{ employee_id: E1, eintrittsdatum: `${jahr - 1}-01-01` }],
    employee_urlaubsanspruch: [{ employee_id: E1, tage_pro_jahr: 30, gueltig_ab: `${jahr - 1}-01-01` }],
    absences: [
      { id: 'a1', employee_id: E1, type: 'vacation', status: 'approved', start_date: `${jahr}-01-05`, end_date: `${jahr}-01-09` },
      { id: 'a2', employee_id: E1, type: 'sick', status: 'approved', start_date: `${jahr}-02-02`, end_date: `${jahr}-02-06` },
      { id: 'a3', employee_id: E2, type: 'vacation', status: 'pending', start_date: `${jahr}-01-12`, end_date: `${jahr}-01-16` },
    ],
  }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const route = () => import('@/app/api/urlaubskonto/route')
const get = async (q: string) => (await route()).GET(new Request('http://x/api/urlaubskonto' + q) as never)

describe('Route Urlaubskonto', () => {
  it('der Mitarbeiter sieht sein eigenes Konto; Krankheit zählt nicht als Urlaub', async () => {
    const j = await (await get('?employee_id=' + E1)).json()
    expect(j.konto.anspruchJahr).toBe(30)
    expect(j.konto.zeilen).toHaveLength(1)
    expect(j.konto.genommenBezahlt).toBeGreaterThan(0)
    expect(j.konto).not.toHaveProperty('stundenlohn')
  })
  it('fremde Konten sind für Mitarbeiter gesperrt, für Dispo und Chef offen', async () => {
    expect((await get('?employee_id=' + E2)).status).toBe(403)
    expect((await get('?alle=1')).status).toBe(403)
    for (const r of ['disponent', 'admin']) { rolle = r; expect((await get('?employee_id=' + E2)).status).toBe(200) }
  })
  it('Vorschau meldet unbezahlte Tage, wenn der Anspruch nicht reicht', async () => {
    db.employee_personal[0] = { employee_id: E1, eintrittsdatum: `${jahr}-01-01` }
    db.employee_urlaubsanspruch[0] = { employee_id: E1, tage_pro_jahr: 12, gueltig_ab: `${jahr - 1}-01-01` }
    // Anspruch im Januar: 1 Tag, davon sind 5 schon durch a1 beantragt: weiterer Urlaub im Januar ist unbezahlt
    const j = await (await get(`?employee_id=${E1}&von=${jahr}-01-19&bis=${jahr}-01-23`)).json()
    expect(j.vorschau.unbezahlt).toBe(5)
    expect(j.vorschau.hinweis).toContain('unbezahlter Urlaub')
  })
  it('prüft die Eingaben', async () => {
    expect((await get('?employee_id=kaputt')).status).toBe(400)
    expect((await get(`?employee_id=${E1}&von=2026-01-05`)).status).toBe(400)
    expect((await get(`?employee_id=${E1}&von=2026-01-09&bis=2026-01-05`)).status).toBe(400)
  })
  it('Dispo und Chef bekommen die Konten aller aktiven Mitarbeiter', async () => {
    rolle = 'disponent'
    const j = await (await get('?alle=1')).json()
    expect(j.konten.map((k: any) => k.name)).toEqual(['Max Muster', 'Ina Zweit'])
    expect(j.konten[1].konto.zeilen[0].tage).toBe(5)
  })
})
