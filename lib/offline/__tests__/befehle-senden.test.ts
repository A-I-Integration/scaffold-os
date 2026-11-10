import { describe, expect, it } from 'vitest'
import { sendeBefehl } from '../befehle-senden'
import type { Befehl } from '../nachsenden'

const b = (art: Befehl['art'], daten: unknown = {}): Befehl => ({ id: 'x', art, projectId: 'p1', daten, titel: 't', erstellt: '' })
const antwort = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

describe('sendeBefehl', () => {
  it('Nachtrag geht als POST mit project_id und aenderung', async () => {
    let gesehen: { url: string; init: RequestInit } | null = null
    const f = (async (url: string, init: RequestInit) => { gesehen = { url, init }; return new Response('{"success":true}', { status: 200 }) }) as unknown as typeof fetch
    const r = await sendeBefehl(b('nachtrag', { op: 'anlegen', id: 'n1' }), f)
    expect(r.ergebnis).toBe('erledigt')
    expect(gesehen!.url).toBe('/api/nachtraege'); expect(gesehen!.init.method).toBe('POST')
    expect(JSON.parse(String(gesehen!.init.body))).toEqual({ project_id: 'p1', aenderung: { op: 'anlegen', id: 'n1' } })
  })
  it('Material: PUT; Schritt 6: PATCH mit dem gemerkten Body', async () => {
    const urls: string[] = []
    const f = (async (u: string, i: RequestInit) => { urls.push(`${i.method} ${u}`); return new Response('{"success":true}', { status: 200 }) }) as unknown as typeof fetch
    await sendeBefehl(b('material', []), f); await sendeBefehl(b('schritt6', { id: 'p1', data: {} }), f)
    expect(urls).toEqual(['PUT /api/materialmanager', 'PATCH /api/projects'])
  })
  it('kein Netz (TypeError), 401, 5xx und gleichzeitige Änderung: später erneut', async () => {
    expect((await sendeBefehl(b('nachtrag'), (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch)).ergebnis).toBe('netz')
    expect((await sendeBefehl(b('nachtrag'), antwort(401, { error: 'x' }))).ergebnis).toBe('netz')
    expect((await sendeBefehl(b('nachtrag'), antwort(503, { error: 'x' }))).ergebnis).toBe('netz')
    expect((await sendeBefehl(b('nachtrag'), antwort(409, { error: 'Gleichzeitig wurde etwas geändert. Bitte noch einmal versuchen.' }))).ergebnis).toBe('netz')
  })
  it('endgültige Ablehnung wird mit Grund gemeldet', async () => {
    expect(await sendeBefehl(b('nachtrag'), antwort(404, { error: 'Dieser Nachtrag existiert nicht mehr.' }))).toEqual({ ergebnis: 'verworfen', grund: 'Dieser Nachtrag existiert nicht mehr.' })
    expect((await sendeBefehl(b('material'), antwort(403, { error: 'Keine Berechtigung' }))).ergebnis).toBe('verworfen')
    expect((await sendeBefehl(b('schritt6'), antwort(200, { success: false, error: 'Projekt abgeschlossen' }))).ergebnis).toBe('verworfen')
  })
})
