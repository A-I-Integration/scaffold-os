import { describe, it, expect } from 'vitest'
import { pruefeLagerAntwort, findeArtikel, baueWareneingang, type ArtikelKurz } from '../ki-lager'

const A: ArtikelKurz[] = [
  { id: 'a1', sku: 'RG-200', name: 'Rahmen 2,00 m', unit: 'Stk', barcode: '4006381333931' },
  { id: 'a2', sku: 'DG-250', name: 'Diagonale 2,50 m', unit: 'Stk', barcode: null },
  { id: 'a3', sku: 'BB-307', name: 'Belagbohle Stahl 3,07 m', unit: 'Stk', barcode: null },
]
describe('KI-Antwort bereinigen', () => {
  it('lässt Zeilen ohne Bezeichnung fallen und prüft Mengen', () => {
    const r = pruefeLagerAntwort({ belegnummer: ' LS-1 ', positionen: [{ bezeichnung: 'Rahmen', menge: 40 }, { bezeichnung: '', menge: 3 }, { bezeichnung: 'Diagonale', menge: 2.5 }, { bezeichnung: 'Bohle', menge: '12' }, { bezeichnung: 'X', menge: -4 }, 7, null] })
    expect(r.belegnummer).toBe('LS-1')
    expect(r.positionen.map((p) => [p.bezeichnung, p.menge])).toEqual([['Rahmen', 40], ['Diagonale', null], ['Bohle', 12], ['X', null]])
  })
  it('Müll hinein, leere Liste heraus', () => { expect(pruefeLagerAntwort('hallo').positionen).toEqual([]); expect(pruefeLagerAntwort(null).positionen).toEqual([]) })
  it('begrenzt auf 100 Positionen', () => { expect(pruefeLagerAntwort({ positionen: Array.from({ length: 300 }, (_, i) => ({ bezeichnung: 'P' + i, menge: 1 })) }).positionen.length).toBe(100) })
})
describe('Artikel zuordnen', () => {
  it('Artikelnummer oder Barcode: sicher', () => {
    expect(findeArtikel({ bezeichnung: 'irgendwas', menge: 1, einheit: null, artikelnummer: 'rg-200' }, A)).toMatchObject({ sicherheit: 'sicher', artikel: { id: 'a1' } })
    expect(findeArtikel({ bezeichnung: 'x', menge: 1, einheit: null, artikelnummer: '4006381333931' }, A).artikel?.id).toBe('a1')
  })
  it('gleicher Name: sicher', () => { expect(findeArtikel({ bezeichnung: 'Rahmen 2,00 m', menge: 1, einheit: null, artikelnummer: null }, A).sicherheit).toBe('sicher') })
  it('ähnlicher Name: nur Vorschlag', () => {
    const t = findeArtikel({ bezeichnung: 'Stahl Belagbohle 3,07m', menge: 1, einheit: null, artikelnummer: null }, A)
    expect(t.sicherheit).toBe('vorschlag'); expect(t.artikel?.id).toBe('a3')
  })
  it('unbekannt: keiner', () => { expect(findeArtikel({ bezeichnung: 'Kaffeemaschine', menge: 1, einheit: null, artikelnummer: null }, A)).toMatchObject({ sicherheit: 'keiner', artikel: null }) })
})
describe('Wareneingang bauen', () => {
  const z = (o: Partial<{ inventory_id: string | null; menge: number | null; einbuchen: boolean }>) => ({ inventory_id: 'a1', menge: 5, einbuchen: true, ...o })
  it('baut Positionen nur aus bestätigten Zeilen', () => {
    const r = baueWareneingang([z({}), z({ einbuchen: false, inventory_id: null })], 'ort1')
    expect(r).toEqual({ ok: true, positionen: [{ inventory_id: 'a1', menge: 5, nach_lagerort: 'ort1', nach_zustand: 'frei' }] })
  })
  it('ohne Lagerort, ohne Auswahl, ohne Artikel, mit falscher Menge: gar nichts', () => {
    expect(baueWareneingang([z({})], null).ok).toBe(false)
    expect(baueWareneingang([z({ einbuchen: false })], 'o').ok).toBe(false)
    expect(baueWareneingang([z({ inventory_id: null })], 'o').ok).toBe(false)
    expect(baueWareneingang([z({ menge: 0 })], 'o').ok).toBe(false)
    expect(baueWareneingang([z({ menge: 2.5 })], 'o').ok).toBe(false)
    expect(baueWareneingang([z({}), z({ menge: null })], 'o').ok).toBe(false)
  })
})
