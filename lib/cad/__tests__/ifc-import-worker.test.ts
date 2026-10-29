import { describe, expect, it } from 'vitest'
import * as arbeiter from '../../../workers/ki/ifc-import.js'
import { leseIfc, leiteIfcAb, type IfcRohmodell } from '@/lib/cad/ifc-einleser'
import { hausZweiGeschosse, lFormHaus, hausMitAnbau } from '@/lib/cad/ifc-testmodelle'
import { speicherPfadGueltig, pruefeKopfUndEnde } from '@/lib/cad/ifc-import'
import { importiereIfcImWorker, baueSpeicherPfad, dateiPruefen, type IfcImportDeps } from '@/lib/cad/ifc-import-client'

const bytes = (t: string) => new TextEncoder().encode(t)

describe('Worker-IFC-Import = Browser-Import (gleiche Ableitung)', () => {
  for (const [name, text] of [['Haus 2 Geschosse', hausZweiGeschosse()], ['L-Form', lFormHaus()], ['Anbau', hausMitAnbau()]] as const) {
    it(`${name}: Worker-Rohmodell → leiteIfcAb liefert dasselbe wie leseIfc`, async () => {
      const w = await arbeiter.verarbeiteIfc(bytes(text), {})
      expect(w.glb.byteLength).toBeGreaterThan(100)
      expect(w.eigenschaften.fehlerElemente).toHaveLength(0)
      const roh = JSON.parse(JSON.stringify(w.eigenschaften.rohmodell)) as IfcRohmodell
      const a = await leiteIfcAb(roh)
      const b = await leseIfc(bytes(text))
      expect(a.ok && b.ok).toBe(true)
      if (!a.ok || !b.ok) return
      expect(a.geschosse.map((g) => g.name)).toEqual(b.geschosse.map((g) => g.name))
      // Ganzes Ergebnis (Umriss, Teile, Höhen, Geschosse) muss gleich sein; nur Hinweise/Fortschritt dürfen abweichen
      const rund = (x: unknown) => JSON.parse(JSON.stringify(x, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)))
      const ohne = (x: object) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'hinweise'))
      expect(rund(ohne(a))).toEqual(rund(ohne(b)))
    })
  }
})

describe('Hilfsfunktionen', () => {
  it('speicherPfadGueltig', () => {
    expect(speicherPfadGueltig('temp/abc_12/ifc/a.ifc')).toBe(true)
    expect(speicherPfadGueltig('projects/123e4567-e89b-12d3-a456-426614174000/ifc/a.ifc')).toBe(true)
    expect(speicherPfadGueltig('temp/abc/../x/ifc/a.ifc')).toBe(false)
    expect(speicherPfadGueltig('temp/abc/ifc/a.pdf')).toBe(false)
    expect(speicherPfadGueltig('fremd/abc/ifc/a.ifc')).toBe(false)
  })
  it('baueSpeicherPfad passt zur Pfadregel', () => {
    expect(speicherPfadGueltig(baueSpeicherPfad('Haus Müller (1).IFC', 'sitz-1', null))).toBe(true)
    expect(speicherPfadGueltig(baueSpeicherPfad('a.ifc', null, '123e4567-e89b-12d3-a456-426614174000'))).toBe(true)
  })
  it('pruefeKopfUndEnde erkennt Nicht-IFC', () => {
    const t = bytes(hausZweiGeschosse())
    expect(pruefeKopfUndEnde(t, new Uint8Array(0), t.length).ok).toBe(true)
    expect(pruefeKopfUndEnde(bytes('hallo welt'), new Uint8Array(0), 10).ok).toBe(false)
    expect(pruefeKopfUndEnde(t, new Uint8Array(0), 0).ok).toBe(false)
  })
  it('dateiPruefen', () => {
    expect(dateiPruefen({ name: 'a.ifc', size: 10 })).toBeNull()
    expect(dateiPruefen({ name: 'a.dxf', size: 10 })).not.toBeNull()
    expect(dateiPruefen({ name: 'a.ifc', size: 151 * 1024 * 1024 })).not.toBeNull()
  })
})

describe('importiereIfcImWorker (Ablauf mit Attrappen)', () => {
  const datei = () => new File([hausZweiGeschosse()], 'haus.ifc')
  const deps = async (): Promise<{ d: Partial<IfcImportDeps>; log: string[] }> => {
    const w = await arbeiter.verarbeiteIfc(bytes(hausZweiGeschosse()), {})
    const props = new TextEncoder().encode(JSON.stringify(w.eigenschaften))
    const log: string[] = []
    let n = 0
    return {
      log,
      d: {
        hochladen: async (_f, pfad, an) => { log.push('up:' + pfad); an(0.5); an(1) },
        postJob: async () => ({ status: 200, json: { success: true, jobId: 'j1' } }),
        getJob: async () => (++n < 3 ? { status: 200, json: { success: true, status: 'processing', fortschritt: { anteil: 0.5, text: 'x' } } }
          : { status: 200, json: { success: true, status: 'done', bucket: 'b', glbPfad: 'g', eigenschaftenPfad: 'e', fehlerAnzahl: 0 } }),
        ladeDatei: async (_b, p) => (p === 'e' ? props.buffer.slice(props.byteOffset, props.byteOffset + props.byteLength) as ArrayBuffer : w.glb.buffer.slice(w.glb.byteOffset, w.glb.byteOffset + w.glb.byteLength) as ArrayBuffer),
        warte: async () => {}, jetzt: () => 0,
      },
    }
  }
  it('liefert Ergebnis und GLB', async () => {
    const { d, log } = await deps()
    const r = await importiereIfcImWorker(datei(), { sessionId: 's1', deps: d })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.aussehen?.art).toBe('glb'); expect(r.teilweise).toBe(false); expect(r.ergebnis.geschosse.length).toBe(2) }
    expect(log[0]).toMatch(/^up:temp\/s1\/ifc\//)
  })
  it('meldet Jobfehler mit Text', async () => {
    const { d } = await deps()
    d.getJob = async () => ({ status: 200, json: { success: false, status: 'error', error: 'kaputt', grund: 'kaputt' } })
    const r = await importiereIfcImWorker(datei(), { deps: d })
    expect(r).toMatchObject({ ok: false, meldung: 'kaputt' })
  })
  it('bricht nach Zeitlimit ab', async () => {
    const { d } = await deps()
    let t = 0
    d.jetzt = () => (t += 1000)
    d.getJob = async () => ({ status: 200, json: { success: true, status: 'queued' } })
    const r = await importiereIfcImWorker(datei(), { deps: d, maxMs: 5000 })
    expect(r.ok).toBe(false)
  })
})

describe('Fehler pro Bauteil → Teilergebnis statt Abbruch', () => {
  it('ein Bauteil schlägt fehl: nur dieses fehlt, der Rest bleibt, Import läuft durch', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const W = require('web-ifc')
    const api = new W.IfcAPI()
    await api.Init()
    const m = api.OpenModel(bytes(hausZweiGeschosse()), { COORDINATE_TO_ORIGIN: false })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lesen = require('../../../workers/ki/ifc-lesen.js')
    const ersteWand = api.GetLineIDsWithType(m, W.IFCWALLSTANDARDCASE, false).get(0) ?? api.GetLineIDsWithType(m, W.IFCWALL, false).get(0)
    const echt = api.StreamMeshes.bind(api)
    const kaputt = new Proxy(api, {
      get: (z, k) => k === 'StreamMeshes'
        ? (mm: number, liste: number[], cb: unknown) => { if (liste.includes(ersteWand)) throw new Error('Geometrie kaputt'); return echt(mm, liste, cb) }
        : (z as unknown as Record<string | symbol, unknown>)[k] instanceof Function ? ((z as unknown as Record<string | symbol, (...a: unknown[]) => unknown>)[k]).bind(z) : (z as unknown as Record<string | symbol, unknown>)[k],
    })
    const r = await lesen.leseRohmodell(W, kaputt, m, 1000, { stapel: 40 })
    expect(r.ok).toBe(true)
    expect(r.fehlerElemente).toHaveLength(1)
    expect(r.fehlerElemente[0].id).toBe(ersteWand)
    expect(r.roh.bauteile.length).toBeGreaterThan(0)
    expect(r.roh.bauteile.some((b: { id: number }) => b.id === ersteWand)).toBe(false)
    expect(r.roh.hinweise.join(' ')).toMatch(/konnten nicht gelesen werden/)
    const a = await leiteIfcAb(r.roh)
    expect(a.ok).toBe(true)
  })
})
