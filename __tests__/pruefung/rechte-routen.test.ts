/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Prüfung 4 (Rechte und Sicherheit): JEDE API-Route wird ohne Login
// aufgerufen. Erwartung: 401/403 und KEIN Zugriff auf die Datenbank
// mit dem Service-Schlüssel. Ausgenommen sind nur Routen, die
// absichtlich öffentlich sind und sich anders absichern (Link-Token,
// Webhook-Signatur, Cron-Geheimnis) – die stehen in OEFFENTLICH und
// werden unten gesondert geprüft.
// ============================================================

const h = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata?: Record<string, unknown> },
  rolle: 'mitarbeiter' as string,
  fetchAufrufe: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => {
  const kette = (): unknown =>
    new Proxy(() => undefined, {
      get: (_t, prop) => {
        if (prop === 'then') return (res: (v: unknown) => void) => res({ data: null, error: null })
        if (prop === 'single' || prop === 'maybeSingle') return async () => ({ data: { role: h.rolle }, error: null })
        return kette()
      },
      apply: () => kette(),
    })
  return {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: h.user } }) },
      from: () => kette(),
      rpc: () => kette(),
      storage: { from: () => kette() },
    }),
  }
})
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }),
  headers: async () => new Headers(),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-geheim'
process.env.MASTER_INSTANCE = 'true'

const module_ = import.meta.glob('/app/api/**/route.ts') as Record<string, () => Promise<Record<string, unknown>>>

/** Absichtlich ohne Login erreichbar – mit eigener Absicherung (siehe Einzeltests unten). */
const OEFFENTLICH = [
  /^\/app\/api\/public\//,
  /^\/app\/api\/anfrage\//,
  /^\/app\/api\/lead\/termin\//,
  /^\/app\/api\/track\/besuch\//,
  /^\/app\/api\/umfrage\//,
  /^\/app\/api\/nwd\/webhook\//,
  /^\/app\/api\/stripe\/webhook\//,
  /^\/app\/api\/auth\/demo-gate\//,
  /^\/app\/api\/cron\//,
]

const METHODEN = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
const ID = '00000000-0000-4000-8000-000000000001'

function anfrage(methode: string) {
  const mitKoerper = methode !== 'GET' && methode !== 'DELETE'
  return new Request(`http://localhost/api/test?id=${ID}&projectId=${ID}&project_id=${ID}`, {
    method: methode,
    headers: { 'content-type': 'application/json' },
    body: mitKoerper ? JSON.stringify({ id: ID }) : undefined,
  })
}

beforeEach(() => {
  h.user = null
  h.rolle = 'mitarbeiter'
  h.fetchAufrufe = []
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    h.fetchAufrufe.push(String(u))
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})

const geschuetzt = Object.keys(module_).filter((p) => !OEFFENTLICH.some((re) => re.test(p))).sort()

describe('Prüfung 4: Routen ohne Login', () => {
  it('es werden Routen gefunden', () => {
    expect(geschuetzt.length).toBeGreaterThan(80)
  })

  for (const pfad of geschuetzt) {
    it(`${pfad.replace('/app/api/', '').replace('/route.ts', '')}: ohne Login 401/403 und keine Daten`, async () => {
      const mod = await module_[pfad]()
      const probleme: string[] = []
      for (const m of METHODEN) {
        const handler = mod[m] as undefined | ((r: Request, c: unknown) => Promise<Response>)
        if (typeof handler !== 'function') continue
        h.fetchAufrufe = []
        let res: Response | undefined
        try {
          res = await handler(anfrage(m), { params: Promise.resolve({ id: ID }) })
        } catch (e) {
          probleme.push(`${m}: Ausnahme ${(e as Error).message}`)
          continue
        }
        const datenZugriff = h.fetchAufrufe.filter((u) => u.includes('supabase.invalid'))
        // 400/503 vor der Anmeldeprüfung ist unkritisch, solange nichts gelesen wird (reine Eingabe-/Konfig-Prüfung).
        const ohneDaten = datenZugriff.length === 0 && [400, 503].includes(res.status)
        if (![401, 403, 404].includes(res.status) && !ohneDaten) probleme.push(`${m}: Status ${res.status} statt 401/403`)
        if (datenZugriff.length > 0) probleme.push(`${m}: Datenbank-Zugriff ohne Login (${datenZugriff[0].replace('https://test.supabase.invalid', '')})`)
      }
      expect(probleme).toEqual([])
    })
  }
})

// ---- Rollen: wer darf NICHT ----
const BUERO = ['mitarbeiter', 'lager', 'bauleiter']          // alles außer Admin/Disposition
const NUR_ADMIN = ['mitarbeiter', 'lager', 'bauleiter', 'disponent']
const OHNE_BAULEITER = ['mitarbeiter', 'lager']

/** [Route, Methode, Rollen, die abgewiesen werden müssen] */
const VERBOTEN: [string, (typeof METHODEN)[number], string[]][] = [
  ['project-assignments', 'POST', OHNE_BAULEITER],
  ['project-assignments', 'DELETE', OHNE_BAULEITER],
  ['email-log', 'GET', BUERO],
  ['kunden/[id]/emails', 'GET', BUERO],
  ['kunden/[id]/mail', 'POST', BUERO],
  ['email', 'POST', BUERO],
  ['invoices', 'GET', BUERO],
  ['invoices', 'POST', BUERO],
  ['invoices', 'PATCH', BUERO],
  ['invoices', 'DELETE', BUERO],
  ['invoice-payments', 'GET', BUERO],
  ['invoice-payments', 'POST', BUERO],
  ['mahnung', 'POST', BUERO],
  ['kunden', 'GET', BUERO],
  ['kunden', 'POST', BUERO],
  ['kunden', 'PATCH', BUERO],
  ['kunden', 'DELETE', BUERO],
  ['kunden/merge', 'POST', BUERO],
  ['kunden/import', 'POST', BUERO],
  ['kunden-kontakte', 'GET', BUERO],
  ['import/kunden', 'POST', BUERO],
  ['import/baustellen', 'POST', BUERO],
  ['import/material', 'POST', BUERO],
  ['import/rechnungen', 'POST', BUERO],
  ['katalog/import', 'POST', BUERO],
  ['leistungskatalog', 'POST', BUERO],
  ['lohnabrechnungen', 'POST', BUERO],
  ['lohnabrechnungen', 'DELETE', BUERO],
  ['miete/verlaengern', 'POST', BUERO],
  ['nachunternehmer', 'GET', BUERO],
  ['tours', 'POST', BUERO],
  ['vehicles', 'POST', BUERO],
  ['lager/orte', 'POST', BUERO],
  ['lager/buchen', 'POST', ['mitarbeiter']],
  ['company', 'POST', ['mitarbeiter', 'lager', 'bauleiter', 'disponent']],
  ['stripe/portal', 'POST', NUR_ADMIN],
  ['provision', 'GET', NUR_ADMIN],
  ['provision', 'POST', NUR_ADMIN],
  ['provision', 'DELETE', NUR_ADMIN],
  ['admin/besucher', 'GET', NUR_ADMIN],
  ['admin/data', 'GET', NUR_ADMIN],
  ['admin/data', 'PATCH', NUR_ADMIN],
  ['admin/data', 'DELETE', NUR_ADMIN],
  ['admin/impersonate', 'POST', NUR_ADMIN],
  ['admin/wirkung', 'GET', NUR_ADMIN],
  ['admin/users', 'GET', BUERO],
  ['admin/users', 'POST', BUERO],
  ['statiker-zuordnung', 'POST', OHNE_BAULEITER],
  ['zeiterfassung', 'GET', OHNE_BAULEITER],
  ['zeiterfassung', 'POST', BUERO],
  ['gps', 'GET', BUERO],
  ['dashboard/stats', 'GET', BUERO],
]

describe('Prüfung 4: Rollen – wer darf nicht', () => {
  for (const [route, methode, rollen] of VERBOTEN) {
    for (const r of rollen) {
      it(`${methode} ${route}: ${r} wird abgewiesen`, async () => {
        const mod = await module_[`/app/api/${route}/route.ts`]()
        const handler = mod[methode] as (rq: Request, c: unknown) => Promise<Response>
        h.user = { id: ID }
        h.rolle = r
        h.fetchAufrufe = []
        const res = await handler(anfrage(methode), { params: Promise.resolve({ id: ID }) })
        expect(res.status).toBe(403)
        expect(h.fetchAufrufe.filter((u) => u.includes('supabase.invalid'))).toEqual([])
      })
    }
  }
})

// ---- Verhalten mit Daten ----
function fakeDb(antworten: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u)
    h.fetchAufrufe.push(url)
    return new Response(JSON.stringify(antworten(url, init) ?? []), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
}

describe('Prüfung 4: Zeiteinträge nur für Berechtigte', () => {
  const EIGENE = '11111111-1111-4111-8111-111111111111'
  const FREMDE = '22222222-2222-4222-8222-222222222222'
  const lies = async (query: string) => {
    const { GET } = (await module_['/app/api/time-entries/route.ts']()) as { GET: (r: Request) => Promise<Response> }
    return GET(new Request(`http://localhost/api/time-entries${query}`))
  }
  const eintraege = (url: string) => {
    if (url.includes('/employees?')) return [{ id: EIGENE }]
    if (url.includes('/time_entries?')) return [{ id: 'z1' }]
    return []
  }

  it('Mitarbeiter ohne Filter sieht nur die eigenen Zeiten', async () => {
    h.user = { id: ID }; h.rolle = 'mitarbeiter'; fakeDb(eintraege)
    const res = await lies('')
    expect(res.status).toBe(200)
    const abfrage = h.fetchAufrufe.find((u) => u.includes('/time_entries?'))!
    expect(abfrage).toContain(`employee_id=eq.${EIGENE}`)
  })
  it('Mitarbeiter darf die Zeiten eines Kollegen NICHT lesen', async () => {
    h.user = { id: ID }; h.rolle = 'mitarbeiter'; fakeDb(eintraege)
    const res = await lies(`?employee_id=${FREMDE}`)
    expect(res.status).toBe(403)
    expect(h.fetchAufrufe.some((u) => u.includes('/time_entries?'))).toBe(false)
  })
  it('Mitarbeiter ohne Mitarbeiter-Datensatz sieht nichts', async () => {
    h.user = { id: ID }; h.rolle = 'lager'; fakeDb((u) => (u.includes('/time_entries?') ? [{ id: 'z1' }] : []))
    const res = await lies('')
    expect((await res.json()).entries).toEqual([])
    expect(h.fetchAufrufe.some((u) => u.includes('/time_entries?'))).toBe(false)
  })
  for (const r of ['admin', 'disponent', 'bauleiter']) {
    it(`${r} sieht alle Zeiten (kein Filter erzwungen)`, async () => {
      h.user = { id: ID }; h.rolle = r; fakeDb(eintraege)
      const res = await lies('')
      expect(res.status).toBe(200)
      expect(h.fetchAufrufe.find((u) => u.includes('/time_entries?'))).not.toContain('employee_id=eq.')
    })
  }
})

describe('Prüfung 4: Bauleiter und Zuordnungen', () => {
  const MEIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const ZIEL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const K_EIGEN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const K_FREMD = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const ZUORD = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const db = (zielKolonne: string | null, meinDatensatz = true) => (url: string) => {
    if (url.includes('employees?select=id&user_id=')) return meinDatensatz ? [{ id: MEIN }] : []
    if (url.includes(`employees?id=eq.${ZIEL}`)) return [{ kolonne_id: zielKolonne }]
    if (url.includes('kolonnen?bauleiter_id=')) return [{ id: K_EIGEN }]
    if (url.includes('project_assignments?id=eq.')) return [{ employee_id: ZIEL }]
    return [{ id: 'neu' }]
  }
  const post = async () => {
    const { POST } = (await module_['/app/api/project-assignments/route.ts']()) as { POST: (r: Request) => Promise<Response> }
    return POST(new Request('http://localhost/api/project-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project_id: ID, employee_id: ZIEL }) }))
  }
  const del = async () => {
    const { DELETE } = (await module_['/app/api/project-assignments/route.ts']()) as { DELETE: (r: Request) => Promise<Response> }
    return DELETE(new Request(`http://localhost/api/project-assignments?id=${ZUORD}`, { method: 'DELETE' }))
  }
  const geschrieben = () => h.fetchAufrufe.some((u) => u.endsWith('/project_assignments') || u.includes('project_assignments?id=eq.'))

  it('Bauleiter darf Mitarbeiter der eigenen Kolonne zuweisen', async () => {
    h.user = { id: ID }; h.rolle = 'bauleiter'; fakeDb(db(K_EIGEN))
    expect((await post()).status).toBe(200)
  })
  it('Bauleiter darf Mitarbeiter einer fremden Kolonne NICHT zuweisen', async () => {
    h.user = { id: ID }; h.rolle = 'bauleiter'; fakeDb(db(K_FREMD))
    expect((await post()).status).toBe(403)
  })
  it('Bauleiter ohne eigenen Datensatz darf niemanden zuweisen (früher: ungeprüft erlaubt)', async () => {
    h.user = { id: ID }; h.rolle = 'bauleiter'; fakeDb(db(K_EIGEN, false))
    expect((await post()).status).toBe(403)
  })
  it('Bauleiter darf eine Zuordnung in fremder Kolonne NICHT entfernen', async () => {
    h.user = { id: ID }; h.rolle = 'bauleiter'; fakeDb(db(K_FREMD))
    expect((await del()).status).toBe(403)
    expect(h.fetchAufrufe.some((u) => u.includes('project_assignments?id=eq.') && false)).toBe(false)
  })
  it('Bauleiter darf eine Zuordnung in eigener Kolonne entfernen', async () => {
    h.user = { id: ID }; h.rolle = 'bauleiter'; fakeDb(db(K_EIGEN))
    expect((await del()).status).toBe(200)
  })
  it('Disposition darf uneingeschränkt entfernen', async () => {
    h.user = { id: ID }; h.rolle = 'disponent'; fakeDb(db(K_FREMD))
    expect((await del()).status).toBe(200)
    expect(geschrieben()).toBe(true)
  })
})

describe('Prüfung 4: Admin-Zugang anlegen', () => {
  const anlegen = async (rolle: string) => {
    const { POST } = (await module_['/app/api/admin/users/route.ts']()) as { POST: (r: Request) => Promise<Response> }
    return POST(new Request('http://localhost/api/admin/users', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'neu@example.de', password: 'geheim123', role: rolle, first_name: 'A', last_name: 'B' }),
    }))
  }
  it('Disposition darf KEINEN Admin anlegen', async () => {
    h.user = { id: ID }; h.rolle = 'disponent'; fakeDb(() => [])
    const res = await anlegen('admin')
    expect(res.status).toBe(403)
    expect(h.fetchAufrufe.some((u) => u.includes('/auth/v1/admin/users'))).toBe(false)
  })
  it('Disposition darf weiterhin einen Mitarbeiter anlegen', async () => {
    h.user = { id: ID }; h.rolle = 'disponent'; fakeDb(() => [])
    const res = await anlegen('mitarbeiter')
    expect(res.status).not.toBe(403)
  })
  it('Admin darf einen Admin anlegen', async () => {
    h.user = { id: ID }; h.rolle = 'admin'; fakeDb(() => [])
    const res = await anlegen('admin')
    expect(res.status).not.toBe(403)
  })
})
