import { describe, it, expect, beforeEach, vi } from 'vitest'
import { type Tabellen } from '../ketten/fake-rest'
import { baueFakeRestMitLager } from '../ketten/fake-lager'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

vi.mock('@/lib/auto-tour', () => ({ legeAutoTourAn: async () => ({ hinweis: 'Tour im Test nicht angelegt' }) }))

let db: Tabellen
const material = (zeilen: Record<string, unknown>[]) => { db.projects[0].data = { kiResult: { materialList: zeilen } } }
const lauf = async () => (await import('@/lib/angebot-annahme')).beiAngebotsannahme('p1')
const bestandHaupt = (id: string) => Number(db.inventory.find((i) => i.id === id)!.quantity)
const reserviert = (id: string) => db.site_stock.filter((s) => s.inventory_id === id).reduce((a, s) => a + Number(s.reserved_quantity), 0)

beforeEach(() => {
  db = {
    projects: [{ id: 'p1', name: 'Haus Muster', adresse: 'Straße 1', data: {} }],
    inventory: [
      { id: 'i1', name: 'Rahmen 2,5m', sku: 'R25', unit: 'Stk', quantity: 100, is_active: true },
      { id: 'i2', name: 'Belag 3m', sku: 'B30', unit: 'Stk', quantity: 5, is_active: true },
      { id: 'i3', name: 'Bohle', sku: 'BO', unit: 'm', quantity: 50, is_active: true },
    ],
    site_stock: [], inventory_transactions: [], transport_orders: [],
  }
  vi.stubGlobal('fetch', baueFakeRestMitLager(db))
})

describe('Angebotsannahme: Lager-Automatik', () => {
  it('reserviert Material, zieht es aus dem Lager ab und legt Transportaufträge an', async () => {
    material([{ name: 'Rahmen 2,5m', quantity: 30, unit: 'Stk', articleNumber: 'R25' }])
    const e = await lauf()
    expect(e.reserviert).toEqual(['Rahmen 2,5m'])
    expect(bestandHaupt('i1')).toBe(70)
    expect(reserviert('i1')).toBe(30)
    expect(db.transport_orders).toHaveLength(1)
    expect(db.transport_orders[0].quantity).toBe(30)
  })

  it('ZWEITE Annahme (z. B. nach Korrektur): nichts wird doppelt abgebucht', async () => {
    material([{ name: 'Rahmen 2,5m', quantity: 30, unit: 'Stk', articleNumber: 'R25' }])
    await lauf()
    const e2 = await lauf()
    expect(bestandHaupt('i1')).toBe(70)
    expect(reserviert('i1')).toBe(30)
    expect(db.transport_orders).toHaveLength(1)
    expect(e2.reserviert[0]).toContain('bereits reserviert')
  })

  it('Menge wurde nach der Korrektur erhöht: nur die Differenz wird zusätzlich gebucht', async () => {
    material([{ name: 'Rahmen 2,5m', quantity: 30, unit: 'Stk', articleNumber: 'R25' }])
    await lauf()
    material([{ name: 'Rahmen 2,5m', quantity: 45, unit: 'Stk', articleNumber: 'R25' }])
    await lauf()
    expect(bestandHaupt('i1')).toBe(55)
    expect(reserviert('i1')).toBe(45)
    expect(db.transport_orders.map((t) => t.quantity)).toEqual([30, 15])
  })

  it('Menge wurde verringert: nichts wird gebucht, nichts zurückgebucht (Rückgabe ist Handarbeit)', async () => {
    material([{ name: 'Rahmen 2,5m', quantity: 30, unit: 'Stk', articleNumber: 'R25' }])
    await lauf()
    material([{ name: 'Rahmen 2,5m', quantity: 20, unit: 'Stk', articleNumber: 'R25' }])
    await lauf()
    expect(reserviert('i1')).toBe(30)
  })

  it('derselbe Artikel in zwei Zeilen: Mengen werden zusammengezählt, einmal gebucht', async () => {
    material([
      { name: 'Rahmen 2,5m', quantity: 10, unit: 'Stk', articleNumber: 'R25' },
      { name: 'Rahmen 2,5m', quantity: 5, unit: 'Stk', articleNumber: 'R25' },
    ])
    await lauf()
    expect(bestandHaupt('i1')).toBe(85)
    expect(reserviert('i1')).toBe(15)
    // und bei erneutem Lauf bleibt es dabei
    await lauf()
    expect(bestandHaupt('i1')).toBe(85)
  })

  it('zu wenig Bestand: nichts wird gebucht und es wird gemeldet', async () => {
    material([{ name: 'Belag 3m', quantity: 8, unit: 'Stk', articleNumber: 'B30' }])
    const e = await lauf()
    expect(e.reserviert).toEqual([])
    expect(e.nichtGenugBestand[0]).toContain('Belag 3m')
    expect(bestandHaupt('i2')).toBe(5)
    expect(db.transport_orders).toHaveLength(0)
  })

  it('Leistungszeilen (Sonderteil) werden nicht gebucht, unbekannte Artikel gemeldet, Einheitenkonflikt gemeldet', async () => {
    material([
      { name: 'Aufbauleistung', quantity: 1, unit: 'Pausch', category: 'Sonderteil' },
      { name: 'Unbekannt XY', quantity: 3, unit: 'Stk', articleNumber: 'XX' },
      { name: 'Bohle', quantity: 10, unit: 'Stk', articleNumber: 'BO' },
    ])
    const e = await lauf()
    expect(e.leistungen).toEqual(['Aufbauleistung'])
    expect(e.nichtGefunden).toEqual(['Unbekannt XY'])
    expect(e.einheitenKonflikt).toHaveLength(1)
    expect(bestandHaupt('i3')).toBe(50)
  })

  it('keine Materialliste: Hinweis, nichts gebucht', async () => {
    const e = await lauf()
    expect(e.hinweis).toContain('Keine Materialliste')
  })

  it('Lesefehler beim Prüfen der bisherigen Reservierung: es wird NICHT gebucht', async () => {
    material([{ name: 'Rahmen 2,5m', quantity: 30, unit: 'Stk', articleNumber: 'R25' }])
    const fake = baueFakeRestMitLager(db)
    vi.stubGlobal('fetch', async (u: string, i?: RequestInit) => String(u).includes('inventory_transactions') && (i?.method ?? 'GET') === 'GET' ? new Response('kaputt', { status: 500 }) : fake(u, i))
    const e = await lauf()
    expect(e.nichtGenugBestand[0]).toContain('nichts gebucht')
    expect(bestandHaupt('i1')).toBe(100)
  })

  it('Sicher-Variante vermerkt Fehler am Projekt statt zu werfen', async () => {
    vi.stubGlobal('fetch', async (u: string) => String(u).includes('select=name,adresse,data') ? new Response('x', { status: 500 }) : new Response('[]', { status: 200 }))
    const { beiAngebotsannahmeSicher } = await import('@/lib/angebot-annahme')
    await expect(beiAngebotsannahmeSicher('p1')).resolves.toBeUndefined()
  })
})
