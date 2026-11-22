import { describe, it, expect } from 'vitest'
import { pruefeStammdaten, pruefeProjektnummer, kundenAnschrift, STATUS_WERTE, STATUS_TEXT } from '../projekt-stammdaten'

describe('Projektstatus', () => {
  it('genau die sechs gewünschten Werte mit Anzeigetext', () => {
    expect(STATUS_WERTE.map((s) => STATUS_TEXT[s])).toEqual(['Entwurf', 'In Bearbeitung', 'Prüfung erforderlich', 'Freigegeben', 'Abgeschlossen', 'Archiviert'])
  })
  it('ungültiger Status wird abgelehnt', () => {
    expect(pruefeStammdaten('admin', { status: 'fertig' })).toMatchObject({ ok: false, status: 400 })
  })
  it('„Freigegeben“ nur für Admin, andere Status für alle drei Rollen', () => {
    expect(pruefeStammdaten('disponent', { status: 'freigegeben' })).toMatchObject({ ok: false, status: 403 })
    expect(pruefeStammdaten('bauleiter', { status: 'freigegeben' })).toMatchObject({ ok: false, status: 403 })
    expect(pruefeStammdaten('admin', { status: 'freigegeben' })).toMatchObject({ ok: true })
    for (const r of ['admin', 'disponent', 'bauleiter']) expect(pruefeStammdaten(r, { status: 'in_bearbeitung' })).toMatchObject({ ok: true })
  })
})

describe('Projektnummer', () => {
  it('Format', () => {
    expect(pruefeProjektnummer(' CAD-2026-0007 ')).toEqual({ ok: true, nummer: 'CAD-2026-0007' })
    for (const x of ['', 'ab', '-abc', 'a b c', 'ä123', 'x'.repeat(41), 5]) expect(pruefeProjektnummer(x).ok).toBe(false)
  })
  it('nur Admin darf ändern', () => {
    expect(pruefeStammdaten('disponent', { projektnummer: 'P-100' })).toMatchObject({ ok: false, status: 403 })
    expect(pruefeStammdaten('admin', { projektnummer: 'P-100' })).toEqual({ ok: true, wert: { projektnummer: 'P-100' } })
  })
})

describe('Kunde', () => {
  it('Zuordnen nur Admin und Disposition, Entfernen mit null', () => {
    expect(pruefeStammdaten('bauleiter', { customerId: 'abc' })).toMatchObject({ ok: false, status: 403 })
    expect(pruefeStammdaten('disponent', { customerId: 'abc' })).toEqual({ ok: true, wert: { customerId: 'abc' } })
    expect(pruefeStammdaten('admin', { customerId: null })).toEqual({ ok: true, wert: { customerId: null } })
    expect(pruefeStammdaten('admin', { customerId: 5 as never })).toMatchObject({ ok: false, status: 400 })
  })
  it('leere Änderung wird abgelehnt, nicht genannte Felder bleiben unberührt', () => {
    expect(pruefeStammdaten('admin', {})).toMatchObject({ ok: false })
    expect(pruefeStammdaten('admin', { status: 'entwurf' })).toEqual({ ok: true, wert: { status: 'entwurf' } })
  })
  it('Anschrift aus dem Stammdatensatz, leer wenn nichts hinterlegt', () => {
    expect(kundenAnschrift({ street: 'Hauptstr. 1', zip: '48691', city: 'Vreden' })).toBe('Hauptstr. 1, 48691 Vreden')
    expect(kundenAnschrift({ street: null, zip: '48691', city: null })).toBe('48691')
    expect(kundenAnschrift(null)).toBe('')
  })
})
