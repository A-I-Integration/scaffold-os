import { describe, it, expect, vi, beforeEach } from 'vitest'

const ID = '11111111-1111-4111-8111-111111111111'
const K1 = '22222222-2222-4222-8222-222222222222'
const K2 = '33333333-3333-4333-8333-333333333333'
const KP = '44444444-4444-4444-8444-444444444444'
let antworten: ((url: string, init?: RequestInit) => { status?: number; body: unknown })[]
const aufrufe: { url: string; init?: RequestInit }[] = []

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
  aufrufe.length = 0; antworten = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    aufrufe.push({ url, init })
    const f = antworten.shift(); if (!f) throw new Error('unerwarteter Aufruf ' + url)
    const r = f(url, init); const status = r.status ?? 200
    return { ok: status < 400, status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) }
  }))
})

const kopf = { id: ID, name: 'X', project_id: null, customer_id: K1, projektnummer: 'CAD-2026-0001', status: 'entwurf', revision: 1, updated_at: '', created_at: '', customer: { id: K1, name: 'Muster GmbH' } }

describe('aendereStammdaten', () => {
  it('Rolle ohne Recht: 403, keine Datenbankabfrage', async () => {
    const { aendereStammdaten } = await import('../projekte-server')
    await expect(aendereStammdaten(ID, { projektnummer: 'P-100' }, 'disponent', 'u')).rejects.toMatchObject({ status: 403 })
    expect(aufrufe.length).toBe(0)
  })
  it('Kunde muss im Kundenstamm existieren', async () => {
    const { aendereStammdaten } = await import('../projekte-server')
    antworten = [() => ({ body: [{ id: ID, project_id: null }] }), () => ({ body: [] })]
    await expect(aendereStammdaten(ID, { customerId: K1 }, 'admin', 'u')).rejects.toMatchObject({ status: 404 })
  })
  it('Kundenprojekt mit anderem Kunden: 409, nichts wird geschrieben', async () => {
    const { aendereStammdaten } = await import('../projekte-server')
    antworten = [() => ({ body: [{ id: ID, project_id: KP }] }), () => ({ body: [{ id: K2 }] }), () => ({ body: [{ customer_id: K1 }] })]
    await expect(aendereStammdaten(ID, { customerId: K2 }, 'admin', 'u')).rejects.toMatchObject({ status: 409 })
    expect(aufrufe.some((a) => a.init?.method === 'PATCH')).toBe(false)
  })
  it('gleicher Kunde wie das Kundenprojekt: erlaubt, Revision bleibt unberührt', async () => {
    const { aendereStammdaten } = await import('../projekte-server')
    antworten = [() => ({ body: [{ id: ID, project_id: KP }] }), () => ({ body: [{ id: K1 }] }), () => ({ body: [{ customer_id: K1 }] }), () => ({ body: [kopf] })]
    const r = await aendereStammdaten(ID, { customerId: K1 }, 'disponent', 'u')
    expect(r.customer?.name).toBe('Muster GmbH')
    const patch = JSON.parse(String(aufrufe.find((a) => a.init?.method === 'PATCH')!.init!.body))
    expect(patch.customer_id).toBe(K1); expect('revision' in patch).toBe(false); expect('daten' in patch).toBe(false)
  })
  it('doppelte Projektnummer: 409 mit lesbarem Text', async () => {
    const { aendereStammdaten } = await import('../projekte-server')
    antworten = [() => ({ body: [{ id: ID, project_id: null }] }), () => ({ status: 409, body: '{"code":"23505","message":"duplicate key value violates unique constraint \\"cad_projekte_projektnummer_uq\\""}' })]
    await expect(aendereStammdaten(ID, { projektnummer: 'P-100' }, 'admin', 'u')).rejects.toMatchObject({ status: 409, message: 'Diese Projektnummer ist schon vergeben.' })
  })
  it('Status setzt nur den Status', async () => {
    const { aendereStammdaten } = await import('../projekte-server')
    antworten = [() => ({ body: [{ id: ID, project_id: null }] }), () => ({ body: [{ ...kopf, status: 'in_bearbeitung' }] })]
    const r = await aendereStammdaten(ID, { status: 'in_bearbeitung' }, 'bauleiter', 'u')
    expect(r.status).toBe('in_bearbeitung')
    const patch = JSON.parse(String(aufrufe.find((a) => a.init?.method === 'PATCH')!.init!.body))
    expect(Object.keys(patch).sort()).toEqual(['geaendert_von', 'status', 'updated_at'])
  })
})
