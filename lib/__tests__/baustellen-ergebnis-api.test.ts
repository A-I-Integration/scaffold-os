import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const PID = '22222222-2222-4222-8222-222222222222'
const E1 = '11111111-1111-4111-8111-111111111111'
const E2 = '33333333-3333-4333-8333-333333333333'
const json = (body: unknown, ok = true) => ({ ok, json: async () => body, text: async () => JSON.stringify(body) })
let erlaubt = true

vi.mock('@/lib/auth', () => ({
  pruefeRolle: vi.fn(async () => erlaubt ? { ok: true, userId: 'u', role: 'admin' } : { ok: false, response: NextResponse.json({ success: false }, { status: 403 }) }),
  serverErrorResponse: () => NextResponse.json({ success: false }, { status: 500 }),
}))

const req = (id = PID) => new NextRequest(`http://x/api/baustellen-ergebnis?project_id=${id}`)

describe('GET /api/baustellen-ergebnis', () => {
  beforeEach(() => { erlaubt = true; vi.resetModules() })

  it('summiert je Mitarbeiter, meldet fehlenden Stundensatz und überspringt Einträge ohne Stunden', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (String(u).includes('/time_entries')) return json([
        { employee_id: E1, project_id: PID, work_date: '2026-11-02', hours: 8, spesen_euro: 12.5 }, { employee_id: E1, project_id: PID, work_date: '2026-11-03', hours: 4.5, spesen_euro: null },
        { employee_id: E2, project_id: PID, work_date: '2026-11-02', hours: 6 }, { employee_id: E2, project_id: PID, work_date: '2026-11-03', hours: null },
      ])
      if (String(u).includes('/employees')) return json([{ id: E1, first_name: 'A.', last_name: 'Muster', hourly_rate: 32 }, { id: E2, first_name: 'B.', last_name: 'Beispiel', hourly_rate: 0 }])
      return json([])
    }))
    const { GET } = await import('@/app/api/baustellen-ergebnis/route')
    const res = await GET(req())
    const j = await res.json()
    expect(j.success).toBe(true)
    expect(j.eintraegeOhneStunden).toBe(1)
    const a = j.zeilen.find((z: any) => z.id === E1), b = j.zeilen.find((z: any) => z.id === E2)
    expect(a).toMatchObject({ name: 'A. Muster', stunden: 12.5, satz: 32, spesen: 12.5 })
    expect(b).toMatchObject({ name: 'B. Beispiel', stunden: 6, satz: null })
  })

  it('fällt ohne Spesen-Spalte auf die einfache Abfrage zurück', async () => {
    const f = vi.fn(async (u: string) => {
      if (String(u).includes('spesen_euro')) return json({ message: 'column does not exist' }, false)
      if (String(u).includes('/time_entries')) return json([{ employee_id: E1, hours: 2 }])
      return json([{ id: E1, first_name: 'A.', last_name: 'M', hourly_rate: 30 }])
    })
    vi.stubGlobal('fetch', f)
    const { GET } = await import('@/app/api/baustellen-ergebnis/route')
    const j = await (await GET(req())).json()
    expect(j.success).toBe(true)
    expect(j.zeilen[0].stunden).toBe(2)
  })

  it('verweigert andere Rollen und ungültige IDs, ohne Datenbankzugriff', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const { GET } = await import('@/app/api/baustellen-ergebnis/route')
    expect((await GET(req('keine-uuid'))).status).toBe(400)
    erlaubt = false
    expect((await GET(req())).status).toBe(403)
    expect(f).not.toHaveBeenCalled()
  })

  it('Spesen aus der Tagesberechnung: nach Stunden auf die Baustellen des Tages verteilt, Handeingabe dieses Tages zählt nicht mit', async () => {
    const ANDERE = '99999999-9999-4999-8999-999999999999'
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const url = String(u)
      if (url.includes('/spesen_tage')) return json([{ employee_id: E1, work_date: '2026-11-02', einsatzart: 'auswaerts_voll', vorschlag_tarif: 24, vorschlag_steuer: 28, betrag_manuell: null }])
      if (url.includes('/time_entries')) return json([
        { employee_id: E1, project_id: PID, work_date: '2026-11-02', hours: 6, spesen_euro: 14 },
        { employee_id: E1, project_id: ANDERE, work_date: '2026-11-02', hours: 2, spesen_euro: 7 },
        { employee_id: E1, project_id: PID, work_date: '2026-11-03', hours: 8, spesen_euro: 6 },
      ])
      if (url.includes('/employees')) return json([{ id: E1, first_name: 'A.', last_name: 'Muster', hourly_rate: 32 }])
      return json([])
    }))
    const { GET } = await import('@/app/api/baustellen-ergebnis/route')
    const j = await (await GET(req())).json()
    // 02.11.: 24 € × 6/8 = 18 € auf diese Baustelle; 03.11.: Handeingabe 6 € (keine Tagesberechnung)
    expect(j.zeilen[0].spesen).toBe(24)
  })
})
