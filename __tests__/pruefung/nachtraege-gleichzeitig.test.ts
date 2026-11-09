import { describe, it, expect, beforeEach, vi } from 'vitest'
import { aendereNachtraege, wendeNachtragOpAn, nachtragOpSchema, NachtragFehler, MAX_VERSUCHE, type NachtragOp } from '@/lib/nachtraege-aendern'
import { normalisiereNachtraege, type Nachtrag } from '@/lib/nachtrag'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'

const P = '11111111-1111-4111-8111-111111111111'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const anlegen = (n: number, titel = `N${n}`): NachtragOp => ({ op: 'anlegen', id: id(n), datum: '2026-11-01', titel, grund: 'Grund', betrag: 100, fotos: [] })

/** Attrappe der Datenbank: Projektzeile mit Version; nachtraege_setzen prüft die Version wie die SQL-Funktion. */
function db(start: Nachtrag[] = []) {
  const z = { data: { nachtraege: start as unknown, anderes: 'x' } as Record<string, unknown>, nachtraege_version: 0 }
  let vorSchreiben: (() => void) | null = null
  const f = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u)
    if (url.includes('/rest/v1/projects?')) return new Response(JSON.stringify([structuredClone(z)]))
    if (url.includes('/rpc/nachtraege_setzen')) {
      vorSchreiben?.(); vorSchreiben = null
      const b = JSON.parse(String(init?.body))
      if (b.p_erwartet !== z.nachtraege_version) return new Response('false')
      z.data = { ...z.data, nachtraege: b.p_neu }; z.nachtraege_version++
      return new Response('true')
    }
    return new Response('[]', { status: 404 })
  })
  vi.stubGlobal('fetch', f)
  return { z, f, vorDemSchreiben: (fn: () => void) => { vorSchreiben = fn } }
}

describe('Nachträge: Änderungen anwenden (rein)', () => {
  const basis = wendeNachtragOpAn([], anlegen(1), '2026-11-02')
  it('anlegen vergibt die nächste Nummer; doppelt abgeschickt wird nur einmal angelegt', () => {
    const zwei = wendeNachtragOpAn(basis, anlegen(2), '2026-11-02')
    expect(zwei.map((n) => n.nr)).toEqual([1, 2])
    expect(wendeNachtragOpAn(zwei, anlegen(2), '2026-11-02')).toHaveLength(2)
  })
  it('Betrag nur bei offenen, Löschen nur bei offenen; unbekannte Nachträge melden einen Fehler', () => {
    const bestaetigt = wendeNachtragOpAn(basis, { op: 'status', id: id(1), status: 'bestaetigt' }, '2026-11-02')
    expect(() => wendeNachtragOpAn(bestaetigt, { op: 'betrag', id: id(1), betrag: 5 }, 'x')).toThrow(NachtragFehler)
    expect(() => wendeNachtragOpAn(bestaetigt, { op: 'loeschen', id: id(1) }, 'x')).toThrow(NachtragFehler)
    expect(() => wendeNachtragOpAn(basis, { op: 'status', id: 'weg', status: 'offen' }, 'x')).toThrow(/existiert nicht/)
    expect(wendeNachtragOpAn(basis, { op: 'loeschen', id: 'schon-weg' }, 'x')).toHaveLength(1)
  })
  it('Eingabeprüfung: ungültige Beträge, Daten und Status werden abgelehnt', () => {
    expect(nachtragOpSchema.safeParse({ ...anlegen(1), betrag: -1 }).success).toBe(false)
    expect(nachtragOpSchema.safeParse({ ...anlegen(1), betrag: Infinity }).success).toBe(false)
    expect(nachtragOpSchema.safeParse({ ...anlegen(1), datum: 'gestern' }).success).toBe(false)
    expect(nachtragOpSchema.safeParse({ ...anlegen(1), titel: '  ' }).success).toBe(false)
    expect(nachtragOpSchema.safeParse({ op: 'status', id: 'a', status: 'erledigt' }).success).toBe(false)
    expect(nachtragOpSchema.safeParse({ op: 'betrag', id: 'a', betrag: 0 }).success).toBe(false)
  })
})

describe('Nachträge: gleichzeitiges Speichern', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('zwei Änderungen „gleichzeitig“: beide bleiben erhalten (früher ging eine verloren)', async () => {
    const d = db()
    // A liest (Version 0); bevor A schreibt, legt B einen Nachtrag an. A muss neu lesen und B's Nachtrag behalten.
    d.vorDemSchreiben(() => { d.z.data = { ...d.z.data, nachtraege: [{ id: id(9), nr: 1, datum: '2026-11-01', titel: 'von B', grund: 'g', betrag: 5, fotos: [], status: 'offen', erstelltAm: '2026-11-01T00:00:00Z' }] }; d.z.nachtraege_version++ })
    const neu = await aendereNachtraege(P, anlegen(1, 'von A'), '2026-11-02')
    expect(neu.map((n) => n.titel).sort()).toEqual(['von A', 'von B'])
    expect(neu.map((n) => n.nr).sort()).toEqual([1, 2])
    expect(normalisiereNachtraege(d.z.data.nachtraege)).toHaveLength(2)
  })
  it('schreibt nur den Schlüssel nachtraege – übrige Projektdaten bleiben', async () => {
    const d = db()
    await aendereNachtraege(P, anlegen(1), '2026-11-02')
    expect(d.z.data.anderes).toBe('x')
  })
  it('viele parallele Anlegen: nichts geht verloren, Nummern sind eindeutig', async () => {
    const d = db()
    await Promise.all(Array.from({ length: 4 }, (_, i) => aendereNachtraege(P, anlegen(i + 1), '2026-11-02')))
    const liste = normalisiereNachtraege(d.z.data.nachtraege)
    expect(liste).toHaveLength(4)
    expect(new Set(liste.map((n) => n.nr)).size).toBe(4)
  })
  it('bleibt der Konflikt, gibt es 409 statt stillem Überschreiben', async () => {
    const d = db()
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async (u: RequestInfo | URL) => {
      if (String(u).includes('/rpc/')) { n++; return new Response('false') }
      return new Response(JSON.stringify([structuredClone(d.z)]))
    }))
    await expect(aendereNachtraege(P, anlegen(1), 'x')).rejects.toMatchObject({ status: 409 })
    expect(n).toBe(MAX_VERSUCHE)
  })
  it('Auftrag unbekannt → 404; Datenbankfehler wird weitergegeben', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]')))
    await expect(aendereNachtraege(P, anlegen(1), 'x')).rejects.toMatchObject({ status: 404 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('kaputt', { status: 500 })))
    await expect(aendereNachtraege(P, anlegen(1), 'x')).rejects.toThrow('kaputt')
  })
  it('Projekt ohne Version (Spalte leer) startet bei 0', async () => {
    const d = db(); (d.z as { nachtraege_version?: number }).nachtraege_version = undefined as never
    d.f.mockImplementation(async (u: RequestInfo | URL, init?: RequestInit) => {
      if (String(u).includes('/rpc/')) { expect(JSON.parse(String(init?.body)).p_erwartet).toBe(0); return new Response('true') }
      return new Response(JSON.stringify([{ data: {} }]))
    })
    await aendereNachtraege(P, anlegen(1), 'x')
  })
})
