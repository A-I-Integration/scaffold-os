import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Statiker-APIs mit simuliertem Login und simulierter Datenbank (fetch).
let nutzer: { id: string; app_metadata: Record<string, unknown> } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: nutzer } }) } }),
}))

const PROJEKT_A = '11111111-1111-4111-8111-111111111111'
const PROJEKT_B = '22222222-2222-4222-8222-222222222222'
const STATIKER = '33333333-3333-4333-8333-333333333333'

const cadDaten = {
  kiResult: { building: { lengthM: 12, widthM: 8, heightM: 9, systemId: 'x' }, systemId: 'layher-allround' },
  preis: 99999,
  kunde: 'Geheim GmbH',
}

let aufrufe: string[] = []
let freigaben: { project_id: string; user_id: string }[] = []

beforeEach(() => {
  nutzer = null
  aufrufe = []
  freigaben = [{ project_id: PROJEKT_A, user_id: STATIKER }]
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const u = String(input)
    aufrufe.push(u)
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 })
    if (u.includes('/project_statiker')) {
      const uid = /user_id=eq\.([^&]+)/.exec(u)?.[1]
      const pid = /project_id=eq\.([^&]+)/.exec(u)?.[1]
      return json(freigaben.filter((f) => f.user_id === uid && (!pid || f.project_id === pid)))
    }
    if (u.includes('/projects?')) return json([{ id: PROJEKT_A, name: 'Projekt A', adresse: 'Musterstr. 1', data: cadDaten }])
    if (u.includes('/company_settings')) return json([{ company_name: 'Gerüstbau Test' }])
    return json([])
  }))
})

async function liste() {
  const { GET } = await import('../../app/api/statiker/projekte/route')
  return GET()
}
async function einzeln(id: string) {
  const { GET } = await import('../../app/api/statiker/projekte/[id]/route')
  return GET(new NextRequest(`https://beispiel.test/api/statiker/projekte/${id}`), { params: Promise.resolve({ id }) })
}

describe('Statiker-API: Zugang', () => {
  it('ohne Login → 401, ohne dass die Datenbank gefragt wird', async () => {
    expect((await liste()).status).toBe(401)
    expect((await einzeln(PROJEKT_A)).status).toBe(401)
    expect(aufrufe).toHaveLength(0)
  })

  it('normaler Mitarbeiter-Login (ohne Statiker-Flag) → 403', async () => {
    nutzer = { id: STATIKER, app_metadata: {} }
    expect((await liste()).status).toBe(403)
    expect((await einzeln(PROJEKT_A)).status).toBe(403)
    expect(aufrufe).toHaveLength(0)
  })
})

describe('Statiker-API: nur freigegebene Projekte', () => {
  beforeEach(() => { nutzer = { id: STATIKER, app_metadata: { statiker: true } } })

  it('Liste enthält nur Name und Adresse – keine Preise, Kunden oder Daten', async () => {
    const res = await liste()
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.projekte).toEqual([{ id: PROJEKT_A, name: 'Projekt A', adresse: 'Musterstr. 1' }])
    expect(JSON.stringify(j)).not.toMatch(/preis|Geheim|99999/i)
  })

  it('freigegebenes Projekt: Gebäude + System, aber keine Preise/Kundendaten', async () => {
    const res = await einzeln(PROJEKT_A)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const j = await res.json()
    expect(j.success).toBe(true)
    expect(j.projektName).toBe('Projekt A')
    expect(j.building).toBeTruthy()
    expect(JSON.stringify(j)).not.toMatch(/preis|Geheim|99999/i)
  })

  it('nicht freigegebenes Projekt → 404, ohne das Projekt überhaupt zu laden', async () => {
    const res = await einzeln(PROJEKT_B)
    expect(res.status).toBe(404)
    expect(aufrufe.some((a) => a.includes('/rest/v1/projects?'))).toBe(false)
  })

  it('Freigabe eines anderen Statikers zählt nicht', async () => {
    freigaben = [{ project_id: PROJEKT_A, user_id: '99999999-9999-4999-8999-999999999999' }]
    expect((await einzeln(PROJEKT_A)).status).toBe(404)
    const j = await (await liste()).json()
    expect(j.projekte).toEqual([])
  })

  it('ungültige ID → 404 ohne Datenbank-Abfrage', async () => {
    expect((await einzeln("x') or 1=1--")).status).toBe(404)
    expect(aufrufe).toHaveLength(0)
  })
})
