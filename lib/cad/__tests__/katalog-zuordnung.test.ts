import { describe, it, expect } from 'vitest'
import { passendeArtikel, katalogListeFuerSystem, artikelLabel } from '../katalog-zuordnung'

describe('katalog-zuordnung', () => {
  it('kennt MJ-Systeme, fremde Systeme nicht', () => {
    expect(katalogListeFuerSystem('mj-plus')).toBe('combi')
    expect(katalogListeFuerSystem('peri-up-flex')).toBeNull()
    expect(passendeArtikel('peri-up-flex', 'board')).toEqual([])
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
    expect(wendeKatalogwahlAn('peri-up-flex', bauteile, m, { b1: bord.nr }).materials).toBe(m)
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

import { uebertrageAufGleiche } from '../katalog-zuordnung'

describe('uebertrageAufGleiche', () => {
  const b = [
    { id: 'a1', type: 'board', articleNumber: 'BB-001' }, { id: 'a2', type: 'board', articleNumber: 'BB-001' },
    { id: 'a3', type: 'board', articleNumber: 'BB-002' }, { id: 'r1', type: 'railing', articleNumber: 'BB-001' },
  ]
  it('überträgt nur auf gleichen Typ UND gleichen Standard-Artikel', () => {
    const r = uebertrageAufGleiche(b, {}, 'a1', '000701')
    expect(r).toEqual({ a1: '000701', a2: '000701' })
  })
  it('null entfernt die Wahl bei allen gleichen, andere bleiben', () => {
    const r = uebertrageAufGleiche(b, { a1: '1', a2: '1', a3: '2' }, 'a2', null)
    expect(r).toEqual({ a3: '2' })
  })
  it('unbekannte ID: unverändert (gleiche Referenz); Eingabe wird nicht verändert', () => {
    const w = { a3: '2' }
    expect(uebertrageAufGleiche(b, w, 'zz', '1')).toBe(w)
    uebertrageAufGleiche(b, w, 'a1', '9'); expect(w).toEqual({ a3: '2' })
  })
})


describe('Layher AllroundGerüst', () => {
  it('beide Allround-Systeme nutzen die Layher-Liste', () => {
    expect(katalogListeFuerSystem('layher-allround')).toBe('layher-allround')
    expect(katalogListeFuerSystem('layher-allround-alu')).toBe('layher-allround')
  })
  it('Riegel 1,09 m: Art.-Nr. 2601.109, 4,0 kg, 30,30 € (Preisliste 2026/27)', () => {
    const l = passendeArtikel('layher-allround', 'railing', 1.09)
    expect(l[0].nr).toBe('2601.109')
    expect(l[0].preis).toBe(30.3)
    expect(l[0].attribute['Gewicht (kg)']).toBe(4)
    expect(artikelLabel(l[0])).toMatch(/^2601\.109 · O-Riegel LW/)
  })
  it('Stahlboden 1,09 × 0,32: 3883.109, 7,7 kg, 69,00 €', () => {
    const b = passendeArtikel('layher-allround', 'deck', 1.09).find((a) => a.nr === '3883.109')!
    expect(b.preis).toBe(69)
    expect(b.attribute['Gewicht (kg)']).toBe(7.7)
    expect(b.attribute['Breite (m)']).toBe(0.32)
  })
  it('jeder zugeordnete Typ liefert nur Artikel der Layher-Liste, ohne Sicherungen/Durchstiege', () => {
    for (const t of ['frame', 'deck', 'railing', 'diagonal', 'footplate', 'coupling', 'anchor', 'console', 'board', 'stair']) {
      const l = passendeArtikel('layher-allround', t)
      expect(l.length, t).toBeGreaterThan(0)
      expect(l.every((a) => a.liste === 'layher-allround' && a.preis > 0), t).toBe(true)
    }
    expect(passendeArtikel('layher-allround', 'frame').some((a) => /Sicherung/.test(a.untertitel))).toBe(false)
    expect(passendeArtikel('layher-allround', 'deck').some((a) => /Durchstieg/.test(a.untertitel))).toBe(false)
  })
  it('Typen ohne sichere Regel bleiben ohne Zuordnung', () => {
    expect(passendeArtikel('layher-allround', 'net')).toEqual([])
    expect(passendeArtikel('layher-allround', 'safety_net')).toEqual([])
  })
  it('Stückliste: Riegel-Wahl ersetzt 1 Standardstück', () => {
    const r = passendeArtikel('layher-allround', 'railing', 1.09)[0]
    const m = [{ articleNumber: 'RA-001', name: 'x', category: 'Geländer', quantity: 3, unit: 'Stk', unitPrice: 10, totalPrice: 30, weightKg: 1, riskLevel: 'low' as const, aiRecommendation: '' }]
    const res = wendeKatalogwahlAn('layher-allround', [{ id: 'r1', type: 'railing', articleNumber: 'RA-001' }], m, { r1: r.nr })
    expect(res.ersetzt).toBe(1)
    expect(res.materials.find((x) => x.articleNumber === r.nr)?.name).toMatch(/\(Layher Allround\)$/)
  })
})

import { artikelGewichtKg, artikelMassM } from '../katalog-zuordnung'

describe('RUX SUPER (Katalogwahl)', () => {
  it('Super 65 und Super 100 haben die Preisliste SUPER; Rahmen werden je System getrennt', () => {
    expect(katalogListeFuerSystem('rux-super65')).toBe('sx-super')
    expect(katalogListeFuerSystem('rux-super100')).toBe('sx-super')
    const r65 = passendeArtikel('rux-super65', 'frame').map((a) => a.gruppe)
    const r100 = passendeArtikel('rux-super100', 'frame').map((a) => a.gruppe)
    expect(r65.length).toBeGreaterThan(0)
    expect(r100.length).toBeGreaterThan(0)
    expect(new Set(r65)).toEqual(new Set(['Vertikalrahmen Stahl SUPER 65 ULTRA']))
    expect(new Set(r100)).toEqual(new Set(['Vertikalrahmen Stahl SUPER 100']))
  })
  it('ordnet nur eindeutige Bauteiltypen zu, Kupplungen und Anker nicht', () => {
    for (const typ of ['deck', 'railing', 'diagonal', 'footplate', 'console', 'board', 'stair']) expect(passendeArtikel('rux-super65', typ).length).toBeGreaterThan(0)
    expect(passendeArtikel('rux-super65', 'coupling')).toEqual([])
    expect(passendeArtikel('rux-super65', 'anchor')).toEqual([])
    expect(passendeArtikel('rux-super65', 'diagonal').every((a) => a.gruppe === 'Diagonale')).toBe(true)
  })
  it('liest Maß und Gewicht aus den RUX-Attributen', () => {
    const rahmen = passendeArtikel('rux-super65', 'frame').find((a) => a.nr === '01538U')!
    expect(artikelMassM(rahmen)).toBe(2)
    expect(artikelGewichtKg(rahmen)).toBe(16.5)
  })
  it('Katalogwahl ersetzt das Standardbauteil mit RUX-Preis und -Gewicht', () => {
    const art = passendeArtikel('rux-super65', 'diagonal')[0]
    const mat = [{ articleNumber: 'D-1', name: 'Diagonale', category: 'Diagonalen', quantity: 2, unit: 'Stk', unitPrice: 10, totalPrice: 20, weightKg: 1, riskLevel: 'low', aiRecommendation: '' }] as never
    const r = wendeKatalogwahlAn('rux-super65', [{ id: 'b1', type: 'diagonal', articleNumber: 'D-1' }], mat, { b1: art.nr })
    expect(r.ersetzt).toBe(1)
    const neu = r.materials.find((m) => m.articleNumber === art.nr)!
    expect(neu.unitPrice).toBe(art.preis)
    expect(neu.weightKg).toBe(artikelGewichtKg(art))
    expect(neu.name).toContain('RUX SUPER')
  })
})
