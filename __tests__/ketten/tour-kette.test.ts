import { describe, it, expect, beforeEach, vi } from 'vitest'
import { type Tabellen } from './fake-rest'
import { baueFakeRestMitLager } from './fake-lager'

// ============================================================
// Kettentest: Tour → Fahrer schließt Stopp ab → Lieferung wird verbucht / "nicht fertig geworden" → Folgetag
// Läuft durch die ECHTEN Routen /api/tour-stops (PUT) und /api/tour-stops/nicht-fertig gegen einen Nachbau der Datenbank.
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

const ctx = vi.hoisted(() => ({ rolle: 'monteur', employeeId: 'e1' as string | null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-fahrer' } } }) },
    from: (tabelle: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: tabelle === 'profiles' ? { role: ctx.rolle } : null }),
          maybeSingle: async () => ({ data: tabelle === 'employees' && ctx.employeeId ? { id: ctx.employeeId } : null }),
        }),
      }),
    }),
  }),
}))

const P1 = 'proj-1'
let db: Tabellen

beforeEach(async () => {
  ctx.rolle = 'monteur'
  ctx.employeeId = 'e1'
  db = {
    inventory: [{ id: 'inv1', name: 'Stahlbelag', unit: 'Stk', quantity: 100 }],
    site_stock: [],
    inventory_transactions: [],
    transport_orders: [{ id: 't1', inventory_id: 'inv1', to_project_id: P1, quantity: 30, completed_at: null, status: 'planned' }],
    drivers: [{ id: 'd1', employee_id: 'e1' }],
    tours: [{ id: 'tour1', driver_id: 'd1', team_ids: [] }],
    tour_stops: [{ id: 's1', tour_id: 'tour1', transport_order_id: 't1', project_id: P1, status: 'pending' }],
    taeglicher_einsatz: [],
    project_assignments: [],
    absences: [],
  }
  vi.stubGlobal('fetch', baueFakeRestMitLager(db))
  // Material für den Transport ist reserviert (wie beim Anlegen des Transportauftrags)
  const { bucheAusZentrallager } = await import('@/lib/inventory/buchung')
  await bucheAusZentrallager({ inventory_id: 'inv1', project_id: P1, quantity: 30, reason: 'test', reference_type: 'transport' })
})

async function stoppSetzen(status: string, id = 's1') {
  const { PUT } = await import('@/app/api/tour-stops/route')
  return PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ id, status }) }))
}
async function nichtFertig(stopId = 's1') {
  const { POST } = await import('@/app/api/tour-stops/nicht-fertig/route')
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ stopId }) }))
}
const baustelle = () => db.site_stock.reduce((s: { da: number; reserviert: number }, z) => ({ da: s.da + Number(z.quantity), reserviert: s.reserviert + Number(z.reserved_quantity) }), { da: 0, reserviert: 0 })
const isoIn = (tage: number) => { const d = new Date(); d.setDate(d.getDate() + tage); return d.toISOString().slice(0, 10) }

describe('Kette Tour: Stopp abschließen → Lieferung verbucht', () => {
  it('Fahrer schließt den Stopp ab: Auftrag geliefert, Material von reserviert nach "da", Protokoll', async () => {
    expect(baustelle()).toEqual({ da: 0, reserviert: 30 })
    const r = await stoppSetzen('completed')
    expect(r.status).toBe(200)
    expect(db.tour_stops[0].status).toBe('completed')
    expect(db.transport_orders[0].status).toBe('delivered')
    expect(db.transport_orders[0].completed_at).toBeTruthy()
    expect(baustelle()).toEqual({ da: 30, reserviert: 0 })
    expect(db.inventory_transactions.map((t) => t.type)).toEqual(['out', 'in'])
  })

  it('Zweimal "abgeschlossen" verbucht nicht doppelt', async () => {
    await stoppSetzen('completed')
    await stoppSetzen('completed')
    expect(baustelle()).toEqual({ da: 30, reserviert: 0 })
    expect(db.inventory_transactions.filter((t) => t.type === 'in')).toHaveLength(1)
  })

  it('Nicht zuständiger Mitarbeiter wird abgelehnt und ändert nichts', async () => {
    ctx.employeeId = 'e-fremd'
    const r = await stoppSetzen('completed')
    expect(r.status).toBe(403)
    expect(db.tour_stops[0].status).toBe('pending')
    expect(baustelle()).toEqual({ da: 0, reserviert: 30 })
  })

  it('Disposition darf jeden Stopp setzen', async () => {
    ctx.rolle = 'disponent'; ctx.employeeId = null
    expect((await stoppSetzen('completed')).status).toBe(200)
  })

  it('Unbekannter Stopp: 404', async () => {
    expect((await stoppSetzen('completed', 'gibt-es-nicht')).status).toBe(404)
  })

  it('Stopp "übersprungen": Auftrag bleibt offen, Material bleibt reserviert, späteres Abschließen bucht dann', async () => {
    await stoppSetzen('skipped')
    expect(db.transport_orders[0].completed_at).toBeNull()
    expect(baustelle()).toEqual({ da: 0, reserviert: 30 })
    await stoppSetzen('completed')
    expect(baustelle()).toEqual({ da: 30, reserviert: 0 })
  })

  // --- "Nicht fertig geworden" ---------------------------------------

  it('Nicht fertig: Stopp übersprungen, Mitarbeiter für den nächsten freien Werktag auf derselben Baustelle vorgemerkt, im Team', async () => {
    const r = await nichtFertig()
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(db.tour_stops[0].status).toBe('skipped')
    expect(j.vorgemerkt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const tag = new Date(`${j.vorgemerkt}T00:00:00Z`).getUTCDay()
    expect([0, 6]).not.toContain(tag)
    expect(db.taeglicher_einsatz).toHaveLength(1)
    expect(db.taeglicher_einsatz[0]).toMatchObject({ employee_id: 'e1', project_id: P1, einsatz_datum: j.vorgemerkt })
    expect(db.project_assignments).toHaveLength(1)
  })

  it('Nicht fertig: Tage mit vorhandenem Einsatz oder genehmigtem Urlaub werden übersprungen', async () => {
    db.absences.push({ id: 'a1', employee_id: 'e1', type: 'vacation', status: 'approved', start_date: isoIn(1), end_date: isoIn(14) })
    const j = await (await nichtFertig()).json()
    expect(j.vorgemerkt > isoIn(14)).toBe(true)
  })

  it('Nicht fertig durch fremden Mitarbeiter wird abgelehnt', async () => {
    ctx.employeeId = 'e-fremd'
    expect((await nichtFertig()).status).toBe(403)
    expect(db.tour_stops[0].status).toBe('pending')
  })

  // --- früher gefundene Lücken (behoben) -------------------------------

  it('Ein ungültiger Status ("banane") wird abgelehnt (heute landet jeder Text im Stopp)', async () => {
    const r = await stoppSetzen('banane')
    expect(r.status).toBe(400)
    expect(db.tour_stops[0].status).toBe('pending')
  })

  it('"Nicht fertig" plant nicht auf einen Krankheitstag (heute zählt nur genehmigter Urlaub, Krankmeldungen werden ignoriert)', async () => {
    db.absences.push({ id: 'a2', employee_id: 'e1', type: 'sick', status: 'pending', start_date: isoIn(1), end_date: isoIn(14) })
    const j = await (await nichtFertig()).json()
    expect(j.vorgemerkt > isoIn(14)).toBe(true)
  })
})
