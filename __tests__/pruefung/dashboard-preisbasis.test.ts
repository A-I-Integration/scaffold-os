import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
vi.mock('@/lib/auth', () => ({ pruefeRolle: async () => ({ ok: true }), requireAuth: async () => ({}), unauthorizedResponse: () => new Response('x', { status: 401 }) }))

// Dashboard: Der Projektwert folgt der gewählten Preisbasis (wie Angebot und Auftragsstand), nicht dem reinen KI-Preis.
const ki = { suggestedPrice: 152447, totalCost: 114335, totalAreaM2: 1000, marginPercent: 25 }
let projekte: any[] = []
let kranSatz: number | null = 900
beforeEach(() => {
  projekte = []; kranSatz = 900
  vi.stubGlobal('fetch', async (u: RequestInfo | URL) => {
    const url = String(u)
    const antwort = url.includes('/projects?') ? projekte : url.includes('/company_settings') ? (kranSatz ? [{ calc_crane_day: kranSatz }] : []) : []
    return new Response(JSON.stringify(antwort), { status: 200 })
  })
})
const projekt = (id: string, data: any, extra: any = {}) => ({ id, name: 'P ' + id, status: 'active', created_at: '2026-11-01T10:00:00Z', data, ...extra })
const wert = async (id: string) => {
  const { GET } = await import('@/app/api/dashboard/stats/route')
  const j = await (await GET()).json()
  return (Object.values(j.projectsByMonth ?? {}).flat() as any[]).find((p) => p.id === id)
}

describe('Dashboard-Projektwert', () => {
  it('Festpreis 10 €/m² × 1000 m² → 10.000 €, nicht der KI-Preis 152.447 €', async () => {
    projekte = [projekt('a', { kiResult: ki, preisModus: 'festpreis', festpreisProM2: '10' })]
    expect((await wert('a')).value).toBe(10000)
  })
  it('Pauschale → Pauschalbetrag', async () => {
    projekte = [projekt('a', { kiResult: ki, preisModus: 'pauschale', pauschale: '2500' })]
    expect((await wert('a')).value).toBe(2500)
  })
  it('KI-Kalkulation und ältere Projekte ohne Preisbasis → KI-Preis (unverändert)', async () => {
    projekte = [projekt('a', { kiResult: ki })]
    expect((await wert('a')).value).toBe(152447)
  })
  it('Kran fließt mit dem Firmensatz in den Wert ein, wie im Angebot', async () => {
    projekte = [projekt('a', { kiResult: ki, preisModus: 'festpreis', festpreisProM2: '10', step4: { kranErforderlich: true }, step1: { dauer: '2' } })]
    expect((await wert('a')).value).toBe(10000 + 1800)
    kranSatz = null // ohne Firmensatz Standard 850
    expect((await wert('a')).value).toBe(10000 + 1700)
  })
  it('gespeicherter total_value hat Vorrang', async () => {
    projekte = [projekt('a', { kiResult: ki, preisModus: 'festpreis', festpreisProM2: '10' }, { total_value: 7777 })]
    expect((await wert('a')).value).toBe(7777)
  })
  it('Aufmaß-Projekt mit kiResult unter step6 und CAD-Projekt mit kiResult auf Datenebene werden weiter gefunden', async () => {
    projekte = [projekt('a', { step6: { kiResult: ki }, preisModus: 'festpreis', festpreisProM2: '10' }), projekt('b', { kiResult: { suggestedPrice: 5000, totalCost: 4000 } })]
    expect((await wert('a')).value).toBe(10000); expect((await wert('b')).value).toBe(5000)
  })
  it('bei eigenem Preis kommt die Marge aus den kalkulierten Kosten (hier Verlust), bei KI-Preis bleibt die KI-Marge', async () => {
    projekte = [projekt('a', { kiResult: ki, preisModus: 'festpreis', festpreisProM2: '10' }), projekt('b', { kiResult: ki })]
    expect((await wert('a')).margin).toBeLessThan(0); expect((await wert('a')).profit).toBe(10000 - 114335)
    expect((await wert('b')).margin).toBe(25)
  })
  it('ohne Kalkulation und ohne Preis → 0', async () => {
    projekte = [projekt('a', {})]
    expect((await wert('a')).value).toBe(0)
  })
})
