import { describe, it, expect } from 'vitest'
import { passendeArtikel, katalogListeFuerSystem, artikelLabel } from '../katalog-zuordnung'

describe('katalog-zuordnung', () => {
  it('kennt MJ-Systeme, fremde Systeme nicht', () => {
    expect(katalogListeFuerSystem('mj-plus')).toBe('combi')
    expect(katalogListeFuerSystem('layher-allround')).toBeNull()
    expect(passendeArtikel('layher-allround', 'board')).toEqual([])
  })
  it('Bordbretter COMBI: nur Bereich BORDBRETTER, nach Wunschmaß sortiert', () => {
    const l = passendeArtikel('mj-plus', 'board', 1.09)
    expect(l.length).toBeGreaterThan(0)
    expect(l.every((a) => a.liste === 'combi' && /bordbrett/i.test(a.gruppe))).toBe(true)
    expect(l[0].attribute['Länge (m)']).toBe(1.09)
  })
  it('Bauteiltyp ohne Katalogbereich → keine Zuordnung', () => {
    expect(passendeArtikel('mj-plus', 'net')).toEqual([])
    expect(passendeArtikel('mj-plus', 'load_plate')).toEqual([])
  })
  it('Stiele und Riegel/Geländer in COMBI vorhanden', () => {
    expect(passendeArtikel('mj-plus', 'frame').length).toBeGreaterThan(5)
    expect(passendeArtikel('mj-plus', 'railing').some((a) => /AUSSENGELÄNDER/.test(a.gruppe))).toBe(true)
    expect(artikelLabel(passendeArtikel('mj-plus', 'board')[0])).toMatch(/^\d{6} · /)
  })
})

import { wendeKatalogwahlAn } from '../katalog-zuordnung'
import { liesProjektdatei, erzeugeProjektdatei } from '../projektdatei'
import type { MaterialItem } from '@/types/scaffold'

const mat = (nr: string, q: number, p = 10): MaterialItem => ({ articleNumber: nr, name: nr, category: 'Bordbretter', quantity: q, unit: 'Stk', unitPrice: p, totalPrice: q * p, weightKg: 1, riskLevel: 'low', aiRecommendation: '' })

describe('wendeKatalogwahlAn', () => {
  const bord = passendeArtikel('mj-plus', 'board', 1.09)[0]
  const bauteile = [
    { id: 'b1', type: 'board', articleNumber: 'BB-001' },
    { id: 'b2', type: 'board', articleNumber: 'BB-001' },
    { id: 'b3', type: 'board', articleNumber: 'BB-001' },
  ]
  it('ersetzt je gewähltem Bauteil 1 Standardstück durch den Katalogartikel', () => {
    const r = wendeKatalogwahlAn('mj-plus', bauteile, [mat('BB-001', 3)], { b1: bord.nr, b2: bord.nr })
    expect(r.ersetzt).toBe(2)
    expect(r.materials.find((m) => m.articleNumber === 'BB-001')?.quantity).toBe(1)
    const k = r.materials.find((m) => m.articleNumber === bord.nr)!
    expect(k.quantity).toBe(2)
    expect(k.unitPrice).toBe(bord.preis)
    expect(k.totalPrice).toBeCloseTo(2 * bord.preis, 2)
    expect(k.weightKg).toBe(bord.attribute['Gewicht (kg)'])
  })
  it('Standardposition fällt bei 0 weg; Summe der Stückzahlen bleibt', () => {
    const r = wendeKatalogwahlAn('mj-plus', bauteile, [mat('BB-001', 3)], { b1: bord.nr, b2: bord.nr, b3: bord.nr })
    expect(r.materials.map((m) => m.articleNumber)).toEqual([bord.nr])
    expect(r.materials[0].quantity).toBe(3)
  })
  it('ohne Wahl, fremdes System, unbekannte ID, falscher Typ: unverändert', () => {
    const m = [mat('BB-001', 3)]
    expect(wendeKatalogwahlAn('mj-plus', bauteile, m, {}).materials).toBe(m)
    expect(wendeKatalogwahlAn('layher-allround', bauteile, m, { b1: bord.nr }).materials).toBe(m)
    expect(wendeKatalogwahlAn('mj-plus', bauteile, m, { zz: bord.nr }).ersetzt).toBe(0)
    const frame = passendeArtikel('mj-plus', 'frame')[0]
    expect(wendeKatalogwahlAn('mj-plus', bauteile, m, { b1: frame.nr }).ersetzt).toBe(0)
    expect(wendeKatalogwahlAn('mj-plus', bauteile, m, { b1: '999999' }).unbekannt).toEqual(['999999'])
  })
  it('verändert die Eingabe nicht', () => {
    const m = [mat('BB-001', 3)]
    wendeKatalogwahlAn('mj-plus', bauteile, m, { b1: bord.nr })
    expect(m[0].quantity).toBe(3)
  })
})

describe('Projektdatei: artikelWahl', () => {
  it('wird gespeichert und gelesen, Müll wird verworfen', () => {
    const d = erzeugeProjektdatei({ building: { lengthM: 10, widthM: 8, heightM: 9, roofForm: 'flachdach' } as never, systemId: 'mj-plus', statikDaten: {} as never, notizen: [], artikelWahl: { b1: '000701' } })
    const e = liesProjektdatei(JSON.stringify(d))
    expect(e.ok && e.daten.artikelWahl).toEqual({ b1: '000701' })
    const j = JSON.parse(JSON.stringify(d)); j.artikelWahl = { a: '<script>', b: 5, c: '000701' }
    const e2 = liesProjektdatei(JSON.stringify(j))
    expect(e2.ok && e2.daten.artikelWahl).toEqual({ c: '000701' })
    const alt = JSON.parse(JSON.stringify(d)); delete alt.artikelWahl
    const e3 = liesProjektdatei(JSON.stringify(alt))
    expect(e3.ok && e3.daten.artikelWahl).toBeUndefined()
  })
})

import { passendeArtikelFuerKategorie, setzeKatalogArtikel, stelleStandardWiederHer } from '../katalog-zuordnung'

describe('Aufmaß: Katalogwahl je Position', () => {
  const pos: MaterialItem = { ...mat('BB-001', 4, 22), category: 'Bordbretter', weightKg: 6.5, aiRecommendation: 'Seitenschutz' }
  it('Kategorien ohne Katalogbereich/anderes System: keine Artikel', () => {
    expect(passendeArtikelFuerKategorie('mj-plus', 'Sonderteil')).toEqual([])
    expect(passendeArtikelFuerKategorie('mj-plus', 'Sicherheit')).toEqual([])
    expect(passendeArtikelFuerKategorie('', 'Bordbretter')).toEqual([])
    expect(passendeArtikelFuerKategorie('mj-plus', 'Bordbretter').length).toBeGreaterThan(0)
  })
  it('tauscht Artikel, Menge bleibt, Gesamtpreis neu, Standard wiederherstellbar', () => {
    const art = passendeArtikelFuerKategorie('mj-plus', 'Bordbretter')[0]
    const neu = setzeKatalogArtikel(pos, art, 'MJ COMBI')
    expect(neu.articleNumber).toBe(art.nr)
    expect(neu.quantity).toBe(4)
    expect(neu.totalPrice).toBeCloseTo(4 * art.preis, 2)
    expect(neu.vorKatalog?.articleNumber).toBe('BB-001')
    // zweiter Tausch behält den ursprünglichen Standard
    const art2 = passendeArtikelFuerKategorie('mj-plus', 'Bordbretter')[1]
    expect(setzeKatalogArtikel(neu, art2, 'MJ COMBI').vorKatalog?.articleNumber).toBe('BB-001')
    const zurueck = stelleStandardWiederHer(neu)
    expect(zurueck).toMatchObject({ articleNumber: 'BB-001', unitPrice: 22, weightKg: 6.5, totalPrice: 88, aiRecommendation: 'Seitenschutz' })
    expect(zurueck.vorKatalog).toBeUndefined()
    expect(stelleStandardWiederHer(pos)).toBe(pos)
  })
})
