import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/inventory/buchung', () => ({
  bucheAusZentrallager: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/auto-tour', () => ({
  legeAutoTourAn: vi.fn(async () => ({ hinweis: 'Testlauf: keine Fahrt' })),
}))

import { beiAngebotsannahme } from '@/lib/angebot-annahme'

type Antwort = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }
const antwort = (body: unknown, ok = true, status = 200): Antwort => ({ ok, status, json: async () => body, text: async () => '' })

const PROJEKT = [{ name: 'Testprojekt', adresse: null, data: { kiResult: { materialList: [{ name: 'Rahmen 0,73 m', quantity: 2, unit: 'Stk', articleNumber: 'RA-001' }] }, step1: {} } }]
const LAGER = [{ id: 'inv-1', name: 'Rahmen 0,73 m', sku: 'RA-001', quantity: 100, unit: 'Stk' }]

function installiereFetch(transport: () => Promise<Antwort>) {
  const gespeichert: Record<string, unknown>[] = []
  const fn = vi.fn(async (input: string, init?: { method?: string; body?: string }) => {
    const u = String(input)
    const methode = init?.method ?? 'GET'
    if (u.includes('/rest/v1/transport_orders') && methode === 'POST') return transport()
    if (u.includes('/rest/v1/inventory_transactions')) return antwort([]) // noch nichts reserviert
    if (u.includes('/rest/v1/inventory')) return antwort(LAGER)
    if (u.includes('/rest/v1/projects') && methode === 'GET') return antwort(u.includes('select=name,adresse,data') ? PROJEKT : [{ data: {} }])
    if (u.includes('/rest/v1/projects') && methode === 'PATCH') { gespeichert.push(JSON.parse(String(init?.body))); return antwort([]) }
    return antwort([], false, 404)
  })
  vi.stubGlobal('fetch', fn)
  return { gespeichert }
}

describe('beiAngebotsannahme: Transportauftrag', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('legt den Transportauftrag an, wenn alles klappt', async () => {
    installiereFetch(async () => antwort([{ id: 'to-1' }]))
    const erg = await beiAngebotsannahme('p-1')
    expect(erg.reserviert).toEqual(['Rahmen 0,73 m'])
    expect(erg.transportAngelegt).toEqual(['Rahmen 0,73 m'])
    expect(erg.transportFehler ?? []).toEqual([])
  })

  it('meldet einen fehlgeschlagenen Transportauftrag, statt ihn zu verschweigen', async () => {
    const { gespeichert } = installiereFetch(async () => antwort({ message: 'kaputt' }, false, 500))
    const erg = await beiAngebotsannahme('p-1')
    expect(erg.reserviert).toEqual(['Rahmen 0,73 m'])
    expect(erg.transportAngelegt).toEqual([])
    expect(erg.transportFehler).toHaveLength(1)
    expect(erg.transportFehler?.[0]).toContain('Rahmen 0,73 m')
    expect(erg.transportFehler?.[0]).toContain('500')
    const letzter = gespeichert[gespeichert.length - 1] as { data: { lagerAutomatikErgebnis: { transportFehler: string[] } } }
    expect(letzter.data.lagerAutomatikErgebnis.transportFehler).toHaveLength(1)
  })

  it('bricht nicht ab und vermerkt es, wenn der Aufruf selbst einen Fehler wirft', async () => {
    installiereFetch(async () => { throw new Error('Netz weg') })
    const erg = await beiAngebotsannahme('p-1')
    expect(erg.reserviert).toEqual(['Rahmen 0,73 m'])
    expect(erg.transportFehler?.[0]).toContain('Netz weg')
  })
})
