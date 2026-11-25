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
const E2 = '22222222-2222-4222-8222-222222222222'
let db: Tabellen
beforeEach(() => {
  rolle = 'admin'
  db = {
    employees: [{ id: E1, first_name: 'Max', last_name: 'Muster' }, { id: E2, first_name: 'Eva', last_name: 'Alt' }],
    employee_sonderzahlungen: [
      { id: 's1', employee_id: E1, art: 'gutschein', betrag: 30, monat: '2026-11' },
      { id: 's2', employee_id: E1, art: 'tankrabatt', betrag: 25, monat: '2026-11' },
      { id: 's3', employee_id: E1, art: 'gutschein', betrag: 10, monat: '2026-10' },
    ],
    employee_pfaendungen: [{ id: 'p1', employee_id: E1, glaeubiger: 'Bank', rang: 1, unterhaltspersonen: 0, gueltig_ab: '2026-01-01', gueltig_bis: null, forderung_offen: null }],
    pfaendung_monate: [{ employee_id: E1, monat: '2026-11', netto: 2000, betrag_manuell: null }],
    pfaendung_grenzen: [],
  }
  vi.stubGlobal('fetch', baueFakeRest(db))
})
const get = async (m = '2026-11') => (await import('@/app/api/lohn-uebersicht/route')).GET(new Request('http://x/api/lohn-uebersicht?monat=' + m) as never)

describe('Route Lohnübersicht', () => {
  it('liefert Zahlungen des Monats, Hinweis und berechneten Einbehalt; Mitarbeiter ohne Einträge fehlen', async () => {
    const j = await (await get()).json()
    expect(j.zeilen).toHaveLength(1)
    expect(j.zeilen[0].name).toBe('Muster, Max')
    expect(j.zeilen[0].zahlungen).toHaveLength(2)
    expect(j.zeilen[0].hinweise).toHaveLength(1)
    expect(j.zeilen[0].pfaendung).toMatchObject({ einbehalt: 288.82, pfaendbar: 288.82 })
  })
  it('Pfändung ohne Netto im Monat wird gemeldet', async () => {
    const j = await (await get('2026-12')).json()
    expect(j.zeilen[0]).toMatchObject({ pfaendung: null, pfaendungOhneNetto: true })
  })
  it('nur Chef; Monat prüfen', async () => {
    expect((await get('2026-13')).status).toBe(400)
    rolle = 'disponent'
    expect((await get()).status).toBe(403)
  })
})
