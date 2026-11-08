import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

// ============================================================
// Kettentest: Material reservieren → anliefern → zurückgeben
// Läuft durch die ECHTEN Funktionen (bucheAusZentrallager, bestaetigeAnlieferung, POST /api/inventory/return)
// gegen einen Nachbau der Datenbank. Nach jedem Schritt wird geprüft, was sich im Lager, auf der Baustelle
// und im Protokoll geändert hat.
//
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }),
  }),
}))

let db: Tabellen

beforeEach(() => {
  db = {
    inventory: [{ id: 'inv1', name: 'Stahlbelag', unit: 'Stk', quantity: 100 }],
    site_stock: [],
    inventory_transactions: [],
    transport_orders: [],
  }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

const summeBaustelle = () => db.site_stock.reduce((s, z) => s + Number(z.quantity), 0)
const summeReserviert = () => db.site_stock.reduce((s, z) => s + Number(z.reserved_quantity), 0)

async function reservieren(menge: number) {
  const { bucheAusZentrallager } = await import('@/lib/inventory/buchung')
  return bucheAusZentrallager({ inventory_id: 'inv1', project_id: 'p1', quantity: menge, reason: 'test', reference_type: 'reservation' })
}
async function anliefern(menge: number) {
  const { bestaetigeAnlieferung } = await import('@/lib/inventory/buchung')
  db.transport_orders.push({ id: `to${db.transport_orders.length + 1}`, inventory_id: 'inv1', to_project_id: 'p1', quantity: menge, completed_at: null })
  return bestaetigeAnlieferung(`to${db.transport_orders.length}`)
}
async function zurueckgeben(zurueck: number, verlust: number) {
  const { POST } = await import('@/app/api/inventory/return/route')
  const req = new Request('http://x/api/inventory/return', { method: 'POST', body: JSON.stringify({ project_id: 'p1', items: [{ inventory_id: 'inv1', zurueck, fehlt_beschaedigt: verlust }] }) })
  return POST(req as never)
}

describe('Kette Material: reservieren → anliefern → zurückgeben', () => {
  it('Schritt 1 Reservieren: Lager sinkt, Baustelle hat Reservierung, Protokoll "out"', async () => {
    const r = await reservieren(30)
    expect(r.success).toBe(true)
    expect(db.inventory[0].quantity).toBe(70)
    expect(summeReserviert()).toBe(30)
    expect(summeBaustelle()).toBe(0)
    expect(db.inventory_transactions.map((t) => t.type)).toEqual(['out'])
  })

  it('Reservieren mehr als vorhanden wird abgelehnt und ändert nichts', async () => {
    const r = await reservieren(101)
    expect(r.success).toBe(false)
    expect(db.inventory[0].quantity).toBe(100)
    expect(db.site_stock).toHaveLength(0)
    expect(db.inventory_transactions).toHaveLength(0)
  })

  it('Schritt 2 Anliefern: Reservierung wird physischer Bestand, Auftrag erledigt, Protokoll "in"', async () => {
    await reservieren(30)
    await anliefern(30)
    expect(summeReserviert()).toBe(0)
    expect(summeBaustelle()).toBe(30)
    expect(db.transport_orders[0].completed_at).toBeTruthy()
    expect(db.inventory_transactions.map((t) => t.type)).toEqual(['out', 'in'])
    expect(db.inventory[0].quantity).toBe(70) // Lager ändert sich bei der Anlieferung nicht mehr
  })

  it('Anlieferung doppelt bestätigen verschiebt nichts ein zweites Mal', async () => {
    await reservieren(30)
    const { bestaetigeAnlieferung } = await import('@/lib/inventory/buchung')
    await anliefern(30)
    await bestaetigeAnlieferung('to1')
    expect(summeBaustelle()).toBe(30)
    expect(db.inventory_transactions.filter((t) => t.type === 'in')).toHaveLength(1)
  })

  it('Schritt 3 Rückgabe: Lager steigt, Baustelle sinkt, Verlust nur im Protokoll', async () => {
    await reservieren(30)
    await anliefern(30)
    const res = await zurueckgeben(20, 10)
    expect(res.status).toBe(200)
    expect(db.inventory[0].quantity).toBe(90)
    expect(summeBaustelle()).toBe(0)
    const typen = db.inventory_transactions.map((t) => t.type)
    expect(typen).toEqual(['out', 'in', 'in', 'loss'])
    // Bilanz: Lager + Baustelle + Verlust = Anfangsbestand
    const verlust = db.inventory_transactions.filter((t) => t.type === 'loss').reduce((s, t) => s + Math.abs(Number(t.quantity)), 0)
    expect(Number(db.inventory[0].quantity) + summeBaustelle() + verlust).toBe(100)
  })

  // --- früher gefundene Lücken (behoben) ------------------------------

  it('Zwei Reservierungen derselben Position ergeben eine Zeile je Baustelle und Artikel (heute: eine Zeile je Buchung)', async () => {
    await reservieren(30)
    await reservieren(20)
    expect(db.site_stock).toHaveLength(1)
  })

  it('Rückgabe nach zwei Anlieferungen räumt den gesamten Baustellenbestand (heute nur die erste Zeile)', async () => {
    await reservieren(30); await anliefern(30)
    await reservieren(20); await anliefern(20)
    await zurueckgeben(40, 0)
    expect(summeBaustelle()).toBe(10) // 50 angeliefert − 40 zurück
  })

  it('Rückgabe vor der Anlieferung lässt keine Reservierung stehen, die nie physisch da war', async () => {
    await reservieren(30)
    await zurueckgeben(30, 0)
    expect(summeReserviert()).toBe(0)
  })

  it('Rückgabe von mehr als auf der Baustelle liegt wird abgelehnt (heute: Lager steigt trotzdem)', async () => {
    await reservieren(30); await anliefern(30)
    const res = await zurueckgeben(50, 0)
    expect(res.status).toBe(400)
    expect(db.inventory[0].quantity).toBe(70)
  })
})
