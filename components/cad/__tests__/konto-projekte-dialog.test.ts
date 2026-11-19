import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import KontoProjekteDialog from '../KontoProjekteDialog'
import { listeKontoProjekte, speichereKontoProjekt } from '@/lib/cad/projekte-client'

const h = async () => true
afterEach(() => vi.unstubAllGlobals())

describe('Dialog „Projekte im Konto“', () => {
  it('zeigt Name, Neu-Speichern, geöffnetes Projekt mit Überschreiben', () => {
    const html = renderToStaticMarkup(createElement(KontoProjekteDialog, { aktuell: { id: 'a', name: 'Haus A', revision: 3 }, meldung: null, onNeu: h, onUeberschreiben: h, onLaden: () => {}, onLoeschen: h, onZu: () => {} }))
    for (const t of ['Projekte im Konto', 'Als neues Projekt speichern', 'Geöffnet:', 'Haus A', 'Speichern (überschreibt)']) expect(html).toContain(t)
  })
  it('ohne geöffnetes Projekt kein Überschreiben-Knopf', () => {
    const html = renderToStaticMarkup(createElement(KontoProjekteDialog, { aktuell: null, meldung: 'ok', onNeu: h, onUeberschreiben: h, onLaden: () => {}, onLoeschen: h, onZu: () => {} }))
    expect(html).not.toContain('überschreibt')
  })
})
describe('Konto-Aufrufe', () => {
  it('geben Serverfehler (z. B. 409) als Text zurück, Netzfehler verständlich', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Das Projekt wurde inzwischen geändert.' }), { status: 409 })))
    const r = await speichereKontoProjekt('x', 'n', {} as never, 1)
    expect(r).toEqual({ ok: false, fehler: 'Das Projekt wurde inzwischen geändert.', status: 409 })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await listeKontoProjekte()).toEqual({ ok: false, fehler: 'Keine Verbindung zum Server.', status: 0 })
  })
})
