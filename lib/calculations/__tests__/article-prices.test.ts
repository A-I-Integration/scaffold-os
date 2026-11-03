import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadArticlePricesMitQuelle, loadArticlePrices } from '../article-prices'

const alt = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }
afterEach(() => {
  vi.unstubAllGlobals()
  process.env.NEXT_PUBLIC_SUPABASE_URL = alt.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = alt.key
  vi.restoreAllMocks()
})
const mitLager = () => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k' }
const antwort = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body, text: async () => 'fehler' }))

describe('Artikelpreise: Quelle melden', () => {
  it('ohne Lager-Verbindung: Ersatzpreise mit Hinweis', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const r = await loadArticlePricesMitQuelle()
    expect(r.quelle).toBe('ersatz')
    expect(r.hinweis).toContain('Ersatzpreise')
    expect(r.preise['RA-001'].unitPrice).toBe(45)
  })
  it('Lager nicht erreichbar oder leer: Ersatzpreise mit Hinweis', async () => {
    mitLager(); vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', antwort(null, false))
    expect((await loadArticlePricesMitQuelle()).quelle).toBe('ersatz')
    vi.stubGlobal('fetch', antwort([]))
    const leer = await loadArticlePricesMitQuelle()
    expect(leer.quelle).toBe('ersatz')
    expect(leer.hinweis).toContain('keine aktiven Artikel')
  })
  it('Fehler beim Laden: Ersatzpreise mit Hinweis', async () => {
    mitLager(); vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('netz') }))
    expect((await loadArticlePricesMitQuelle()).quelle).toBe('ersatz')
  })
  it('Lagerpreise vorhanden: Quelle lager, kein Hinweis, Preis aus dem Lager', async () => {
    mitLager(); vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', antwort([{ sku: 'RA-001', unit_price: 50, name: 'Rahmen' }]))
    const r = await loadArticlePricesMitQuelle()
    expect(r.quelle).toBe('lager')
    expect(r.hinweis).toBeUndefined()
    expect(r.preise['RA-001'].unitPrice).toBe(50)
    expect((await loadArticlePrices())['RA-001'].unitPrice).toBe(50)
  })
})
