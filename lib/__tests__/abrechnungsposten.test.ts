import { describe, it, expect } from 'vitest'
import { alsRechnungsPositionen, aufRechnungVorhanden, postenNetto, pruefePosten, summierePosten } from '../abrechnungsposten'

describe('pruefePosten', () => {
  it('akzeptiert Mindestangaben, Standard: Menge 1, Stk., sonstiges', () => {
    const r = pruefePosten({ bezeichnung: ' Erschwernis Hanglage ', einzelpreis: '350,50' })
    expect(r.ok && r.werte).toMatchObject({ bezeichnung: 'Erschwernis Hanglage', menge: 1, einheit: 'Stk.', einzelpreis: 350.5, kategorie: 'sonstiges', bezug_invoice_id: null })
  })
  it('Kategorie, Menge mit Komma, Rechnungsbezug', () => {
    const r = pruefePosten({ bezeichnung: 'Transport', kategorie: 'baulage', menge: '2,5', einheit: 'h', einzelpreis: 80, bezug_invoice_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })
    expect(r.ok && r.werte).toMatchObject({ kategorie: 'baulage', menge: 2.5, einheit: 'h', bezug_invoice_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })
  })
  it('lehnt Fehler ab', () => {
    expect(pruefePosten({ bezeichnung: '', einzelpreis: 1 }).ok).toBe(false)
    expect(pruefePosten({ bezeichnung: 'x', einzelpreis: '' }).ok).toBe(false)
    expect(pruefePosten({ bezeichnung: 'x', einzelpreis: -1 }).ok).toBe(false)
    expect(pruefePosten({ bezeichnung: 'x', einzelpreis: 1, menge: 0 }).ok).toBe(false)
    expect(pruefePosten({ bezeichnung: 'x', einzelpreis: 1, kategorie: 'kaffee' }).ok).toBe(false)
    expect(pruefePosten({ bezeichnung: 'x', einzelpreis: 1, bezug_invoice_id: "1; drop table" }).ok).toBe(false)
  })
})

describe('Summen und Übernahme', () => {
  const l = [
    { id: 'a', bezeichnung: 'A', menge: 2, einheit: 'Stk.', einzelpreis: 10.005, status: 'offen' as const },
    { id: 'b', bezeichnung: 'B', menge: 1, einheit: 'h', einzelpreis: 100, status: 'offen' as const },
    { id: 'c', bezeichnung: 'C', menge: 1, einheit: 'h', einzelpreis: 999, status: 'abgerechnet' as const },
  ]
  it('summiert nur den gewünschten Status', () => {
    expect(postenNetto(l[0])).toBe(20.01)
    expect(summierePosten(l)).toEqual({ anzahl: 2, netto: 120.01 })
    expect(summierePosten(l, 'abgerechnet')).toEqual({ anzahl: 1, netto: 999 })
  })
  it('wandelt in Rechnungspositionen um', () => {
    expect(alsRechnungsPositionen([l[1]])).toEqual([{ bezeichnung: 'B', menge: 1, einheit: 'h', einzelpreis: 100 }])
  })
  it('nur Posten, die noch auf der Rechnung stehen, gelten als abgerechnet', () => {
    expect(aufRechnungVorhanden([{ id: 'a', bezeichnung: 'A' }, { id: 'b', bezeichnung: 'B' }], [{ bezeichnung: 'B ' }, { bezeichnung: 'Sonst' }])).toEqual(['b'])
    // gleiche Bezeichnung zweimal übernommen, nur einmal auf der Rechnung → nur einer zählt
    expect(aufRechnungVorhanden([{ id: 'a', bezeichnung: 'A' }, { id: 'a2', bezeichnung: 'A' }], [{ bezeichnung: 'A' }])).toEqual(['a'])
  })
})
