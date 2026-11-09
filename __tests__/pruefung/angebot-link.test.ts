import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from '../ketten/fake-rest'
import { angebotLinkStatus, holeAngebotLink, sichereAngebotToken, widerrufeAngebotLink, ANGEBOT_LINK_TAGE } from '@/lib/angebot-link'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'

const P = '11111111-1111-4111-8111-111111111111'
const in1h = () => new Date(Date.now() + 3600000).toISOString()
const vor1h = () => new Date(Date.now() - 3600000).toISOString()
let db: Tabellen
const zeile = () => db.project_access_tokens[0] as { token: string; expires_at?: string | null; revoked_at?: string | null }
const tageBis = (iso?: string | null) => Math.round((new Date(iso!).getTime() - Date.now()) / 86400000)

beforeEach(() => {
  db = { project_access_tokens: [] }
  // Die echte Datenbank vergibt den Token als Spaltenstandard; die Attrappe nicht – hier nachgebildet.
  const rest = baueFakeRest(db)
  let zaehler = 0
  vi.stubGlobal('fetch', (u: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST' && String(u).includes('/project_access_tokens')) {
      const b = JSON.parse(String(init.body)); b.token = `neu${++zaehler}`
      return rest(u, { ...init, body: JSON.stringify(b) })
    }
    return rest(u, init)
  })
})

describe('Angebots-Link: Status', () => {
  it('ohne Ablaufdatum gilt der Link (Altlinks), mit Datum nach Frist, widerrufen sticht alles', () => {
    expect(angebotLinkStatus({})).toBe('aktiv')
    expect(angebotLinkStatus({ expires_at: in1h() })).toBe('aktiv')
    expect(angebotLinkStatus({ expires_at: vor1h() })).toBe('abgelaufen')
    expect(angebotLinkStatus({ expires_at: 'kein datum' })).toBe('abgelaufen')
    expect(angebotLinkStatus({ expires_at: in1h(), revoked_at: vor1h() })).toBe('widerrufen')
  })
})

describe('Angebots-Link: Ablauf und Widerruf', () => {
  it('neuer Link gilt 60 Tage', async () => {
    const t = await sichereAngebotToken(P)
    expect(t).toBeTruthy()
    expect(tageBis(zeile().expires_at)).toBe(ANGEBOT_LINK_TAGE)
    expect((await holeAngebotLink(t))?.status).toBe('aktiv')
  })
  it('erneuter Versand behält den Token und setzt die Frist neu (auch bei Altlink und abgelaufenem Link)', async () => {
    db.project_access_tokens.push({ token: 'alt', project_id: P })
    expect(await sichereAngebotToken(P)).toBe('alt')
    expect(tageBis(zeile().expires_at)).toBe(ANGEBOT_LINK_TAGE)
    zeile().expires_at = vor1h()
    expect((await holeAngebotLink('alt'))?.status).toBe('abgelaufen')
    expect(await sichereAngebotToken(P)).toBe('alt')
    expect((await holeAngebotLink('alt'))?.status).toBe('aktiv')
  })
  it('Widerruf sperrt sofort; erneuter Versand beleben den alten Link NICHT, sondern legt einen neuen an', async () => {
    db.project_access_tokens.push({ token: 'alt', project_id: P, expires_at: in1h() })
    expect(await widerrufeAngebotLink(P)).toBe(true)
    expect((await holeAngebotLink('alt'))?.status).toBe('widerrufen')
    const neu = await sichereAngebotToken(P)
    expect(neu).not.toBe('alt')
    expect(await holeAngebotLink('alt')).toBeNull()
    expect((await holeAngebotLink(neu))?.status).toBe('aktiv')
    expect(db.project_access_tokens).toHaveLength(1)
  })
  it('Widerruf ohne Link meldet false', async () => {
    expect(await widerrufeAngebotLink(P)).toBe(false)
  })
  it('unbekannter Token → null', async () => {
    expect(await holeAngebotLink('x'.repeat(48))).toBeNull()
  })
})

describe('Angebots-Link: öffentliche Route', () => {
  const get = async (token: string) => (await import('@/app/api/public/angebot/route')).GET({ nextUrl: new URL(`http://x/api/public/angebot?token=${token}`) } as never)
  beforeEach(() => {
    db.projects = [{ id: P, name: 'Haus', adresse: 'Weg', data: { kiResult: { suggestedPrice: 1 } } }]
    db.company_settings = []
    db.project_media = []
  })
  it('aktiv → 200; abgelaufen und widerrufen → 404', async () => {
    db.project_access_tokens.push({ token: 'ok', project_id: P, expires_at: in1h() })
    expect((await get('ok')).status).toBe(200)
    zeile().expires_at = vor1h()
    expect((await get('ok')).status).toBe(404)
    zeile().expires_at = in1h(); zeile().revoked_at = vor1h()
    expect((await get('ok')).status).toBe(404)
  })
})
