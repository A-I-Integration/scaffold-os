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
const V1 = '33333333-3333-4333-8333-333333333333'
const P1 = '22222222-2222-4222-8222-222222222222'
const z = (h: number, mi: number) => new Date(Date.UTC(2026, 10, 10, h, mi)).toISOString()
let db: Tabellen

function standardDaten(): Tabellen {
  const gps: Record<string, unknown>[] = [{ vehicle_id: V1, created_at: z(5, 25), lat: 51.9, lng: 6.9 }, { vehicle_id: V1, created_at: z(5, 50), lat: 51.95, lng: 6.95 }]
  for (let m = 0; m <= 240; m += 10) gps.push({ vehicle_id: V1, created_at: z(6, 0 + m), lat: 52.0, lng: 7.0 })
  gps.push({ vehicle_id: V1, created_at: z(10, 40), lat: 51.95, lng: 6.95 })
  return {
    tours: [{ id: 't1', name: 'Tour Ahaus', planned_date: '2026-11-10', vehicle_id: V1, driver_id: E1, team_ids: [E1], departed_at: z(5, 30), returned_at: z(11, 0) }],
    tour_stops: [{ id: 's1', tour_id: 't1', stop_order: 1, project_id: P1, address: 'Hauptstr. 1, Ahaus', lat: 52.0, lng: 7.0 }],
    gps_tracking: gps, zeit_abschnitte: [],
    vehicles: [{ id: V1, license_plate: 'BOR-AB 123' }],
  }
}
beforeEach(() => { rolle = 'admin'; db = standardDaten(); vi.stubGlobal('fetch', baueFakeRest(db)) })
const vr = () => import('@/app/api/ortung-vorschlag/route')
const getV = async (q = `datum=2026-11-10&employee_id=${E1}`) => (await vr()).GET(new Request('http://x/api/ortung-vorschlag?' + q) as never)
const postV = async (b: unknown) => (await vr()).POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }) as never)

describe('Route Ortungs-Vorschläge', () => {
  it('liefert Fahrt vom Hof, Baustelle und Rückfahrt, ohne etwas zu speichern', async () => {
    const j = await (await getV()).json()
    expect(j.touren).toHaveLength(1)
    expect(j.touren[0].vorschlaege.map((v: any) => [v.art, v.start_time, v.end_time])).toEqual([['fahrt_hof', z(5, 30), z(6, 0)], ['baustelle', z(6, 0), z(10, 0)], ['fahrt_hof', z(10, 0), z(11, 0)]])
    expect(j.touren[0].vorschlaege[1].project_id).toBe(P1)
    expect(db.zeit_abschnitte).toHaveLength(0)
  })
  it('Übernehmen legt Abschnitte mit Quelle „ortung“ an, ein zweites Mal wird nichts doppelt', async () => {
    expect(await (await postV({ employee_id: E1, work_date: '2026-11-10' })).json()).toMatchObject({ angelegt: 3, uebersprungen: 0 })
    expect(db.zeit_abschnitte).toHaveLength(3); expect(db.zeit_abschnitte.every((a: any) => a.quelle === 'ortung' && a.employee_id === E1)).toBe(true)
    expect(await (await postV({ employee_id: E1, work_date: '2026-11-10' })).json()).toMatchObject({ angelegt: 0, uebersprungen: 3 })
    expect(db.zeit_abschnitte).toHaveLength(3)
  })
  it('sagt, wenn der Mitarbeiter in keiner Tour ist oder keine Positionen vorliegen', async () => {
    expect((await (await getV(`datum=2026-11-11&employee_id=${E1}`)).json()).hinweise[0]).toContain('keiner Tour')
    db.gps_tracking.length = 0
    const j = await (await getV()).json()
    expect(j.touren[0].vorschlaege).toEqual([]); expect(j.touren[0].hinweise.join(' ')).toContain('keine Positionen')
  })
  it('nur Chef und Dispo; ungültige Eingaben werden abgewiesen', async () => {
    for (const r of ['bauleiter', 'mitarbeiter', 'lager']) { rolle = r; expect((await getV()).status).toBe(403); expect((await postV({ employee_id: E1, work_date: '2026-11-10' })).status).toBe(403) }
    rolle = 'disponent'; expect((await getV()).status).toBe(200)
    expect((await getV('datum=x&employee_id=y')).status).toBe(400)
    expect(db.zeit_abschnitte).toHaveLength(0)
  })
})

describe('Route Ortungs-Import', () => {
  const ir = () => import('@/app/api/ortung-import/route')
  const imp = async (csv: unknown) => (await ir()).POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ csv }) }) as never)
  const rows = () => { const t = (h: number) => new Date(Date.now() - 86400000 + h * 60000).toISOString().replace(/\.\d+Z$/, 'Z'); return `Zeit;Kennzeichen;lat;lng\n${t(1)};BOR-AB 123;51,9;6,9\n${t(2)};BOR AB 123;51,91;6,91\n${t(3)};BOR-AB123;51,92;6,92\n${t(4)};XX-YY 9;51,9;6,9\nkaputt;BOR-AB 123;51;6\n2020-01-01T10:00:00Z;BOR-AB 123;51,9;6,9\n` }
  beforeEach(() => {
    const rest = baueFakeRest(db)
    vi.stubGlobal('fetch', async (u: RequestInfo | URL, i?: RequestInit) => {
      if (String(u).includes('/gps_tracking') && (i?.method || 'GET') === 'POST' && String(i?.body).startsWith('[')) { for (const z of JSON.parse(String(i!.body))) db.gps_tracking.push({ id: 'g' + db.gps_tracking.length, ...z }); return new Response('', { status: 201 }) }
      return rest(u, i)
    })
    db.gps_tracking.length = 0
  })
  it('importiert je Fahrzeug über das Kennzeichen, meldet Unbekanntes, Ungültiges und zu Altes', async () => {
    const j = await (await imp(rows())).json()
    expect(j).toMatchObject({ success: true, importiert: 3, doppelt: 0, zuAlt: 1, ungueltig: 1, unbekannteKennzeichen: ['XXYY9'] })
    expect(db.gps_tracking).toHaveLength(3); expect(db.gps_tracking.every((g: any) => g.vehicle_id === V1)).toBe(true)
  })
  it('zweiter Import derselben Datei erzeugt keine Doppelten', async () => {
    await imp(rows())
    const j = await (await imp(rows())).json()
    expect(j).toMatchObject({ importiert: 0, doppelt: 3 }); expect(db.gps_tracking).toHaveLength(3)
  })
  it('weist leere Datei, fehlende Spalten und fremde Rollen ab', async () => {
    expect((await imp('')).status).toBe(400)
    expect((await imp('a;b\n1;2')).status).toBe(400)
    rolle = 'bauleiter'; expect((await imp(rows())).status).toBe(403)
    expect(db.gps_tracking).toHaveLength(0)
  })
})
