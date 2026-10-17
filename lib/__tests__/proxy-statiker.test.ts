import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Der Proxy wird mit einem simulierten Supabase-Login geprüft: gleiche Funktion
// wie in der App, nur die Datenbank-Abfragen sind ersetzt.
type Nutzer = { id: string; email: string; app_metadata: Record<string, unknown> } | null
let aktuellerNutzer: Nutzer = null
let aktuelleRolle: string | null = null
let profilAbfragen = 0

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: aktuellerNutzer } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            profilAbfragen++
            return { data: aktuelleRolle ? { role: aktuelleRolle } : null }
          },
        }),
      }),
    }),
  }),
}))

import { proxy } from '../../proxy'

const anfrage = (pfad: string) => new NextRequest(new URL(pfad, 'https://beispiel.test'))
const ziel = (r: Response) => r.headers.get('location')

beforeEach(() => {
  aktuellerNutzer = null
  aktuelleRolle = null
  profilAbfragen = 0
})

describe('Proxy: Statiker (Flag app_metadata.statiker)', () => {
  beforeEach(() => {
    aktuellerNutzer = { id: 'u1', email: 's@statik.de', app_metadata: { statiker: true } }
    aktuelleRolle = 'statiker'
  })

  it('lässt die eigenen Seiten und APIs durch – ohne Datenbank-Abfrage', async () => {
    for (const p of ['/statiker', '/statiker/abc', '/api/statiker/projekte', '/api/statiker/projekte/123']) {
      const r = await proxy(anfrage(p))
      expect(r.status, p).toBe(200)
      expect(ziel(r), p).toBeNull()
    }
    expect(profilAbfragen).toBe(0)
  })

  it('leitet jede andere Seite zur Statiker-Startseite um', async () => {
    for (const p of ['/', '/dashboard', '/kunden', '/kunden/123', '/rechnungen', '/cad', '/hilfe', '/meine-touren', '/ansicht/abc', '/einstellungen']) {
      const r = await proxy(anfrage(p))
      expect(r.status, p).toBe(307)
      expect(new URL(ziel(r)!).pathname, p).toBe('/statiker')
    }
  })

  it('sperrt jede andere API-Route mit 403 – auch solche, die nur „eingeloggt“ verlangen', async () => {
    for (const p of ['/api/projects', '/api/kunden', '/api/invoices', '/api/project-media', '/api/project-versions', '/api/email-log', '/api/me', '/api/ansicht-link', '/api/statiker-zuordnung', '/api/admin/users', '/api/gps']) {
      const r = await proxy(anfrage(p))
      expect(r.status, p).toBe(403)
    }
  })

  it('schickt einen eingeloggten Statiker von /login zur Startseite', async () => {
    const r = await proxy(anfrage('/login'))
    expect(r.status).toBe(307)
    expect(new URL(ziel(r)!).pathname).toBe('/statiker')
  })

  it('lässt sich nicht mit Pfad-Tricks umgehen', async () => {
    for (const p of ['/statiker/../api/projects', '/api/statiker/../projects', '/statikerx', '/api/statiker-zuordnung']) {
      const r = await proxy(anfrage(p))
      expect([307, 403], p).toContain(r.status)
      if (r.status === 307) expect(new URL(ziel(r)!).pathname, p).toBe('/statiker')
    }
  })
})

describe('Proxy: normale Rollen bleiben unverändert', () => {
  it('Admin kommt weiter überall hin und wird nicht als Statiker behandelt', async () => {
    aktuellerNutzer = { id: 'u2', email: 'a@firma.de', app_metadata: {} }
    aktuelleRolle = 'admin'
    for (const p of ['/dashboard', '/kunden', '/api/projects', '/hilfe']) {
      const r = await proxy(anfrage(p))
      expect(r.status, p).toBe(200)
    }
  })

  it('Mitarbeiter bleibt auf seinen Bereichen (alte Sperre für /kunden gilt weiter)', async () => {
    aktuellerNutzer = { id: 'u3', email: 'm@firma.de', app_metadata: {} }
    aktuelleRolle = 'mitarbeiter'
    const r = await proxy(anfrage('/kunden'))
    expect(r.status).toBe(307)
    expect(new URL(ziel(r)!).pathname).toBe('/meine-touren')
  })

  it('Normale Rollen dürfen /statiker nicht öffnen', async () => {
    for (const rolle of ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager']) {
      aktuellerNutzer = { id: 'u4', email: 'x@firma.de', app_metadata: {} }
      aktuelleRolle = rolle
      const r = await proxy(anfrage('/statiker'))
      expect(r.status, rolle).toBe(307)
      expect(new URL(ziel(r)!).pathname, rolle).not.toBe('/statiker')
    }
  })

  it('Nicht eingeloggt: geschützte Seite → Login, Statiker-Seite ebenfalls', async () => {
    for (const p of ['/dashboard', '/statiker']) {
      const r = await proxy(anfrage(p))
      expect(r.status, p).toBe(307)
      expect(new URL(ziel(r)!).pathname, p).toBe('/login')
    }
  })
})
