import { describe, it, expect } from 'vitest'
import { neuesZwischenaufmassJePosition, markiereAbgerechnet, type Zwischenaufmass, type ZaPositionEingabe } from '../zwischenaufmass'
import { baueAufmassBeleg, erzeugeZwischenaufmassPdf, zwischenaufmassPdfDateiname } from '../zwischenaufmass-pdf'

const P = (bezeichnung: string, menge: number, vertragsmenge?: number, einzelpreis = 10): ZaPositionEingabe => ({ bezeichnung, einheit: 'm²', einzelpreis, menge, ...(vertragsmenge ? { vertragsmenge } : {}) })
const erfasse = (liste: Zwischenaufmass[], pos: ZaPositionEingabe[], id: string, stichtag = '2026-03-01', notiz = '') => {
  const r = neuesZwischenaufmassJePosition(liste, { stichtag, positionen: pos, notiz }, id)
  if (!r.ok) throw new Error(r.fehler)
  return [...liste, r.eintrag]
}
const ab = (l: Zwischenaufmass[], id: string) => markiereAbgerechnet(l, id, { id: 'r-' + id, nummer: 'RE-1' }, '2026-03-02')
// Beispiel der Vorgabe: 800 → 1.000 → 1.200 → 1.250 m²
const kette = () => {
  let l = erfasse([], [P('Fassadengeruest', 800, 1250)], 'a', '2026-03-01'); l = ab(l, 'a')
  l = erfasse(l, [P('Fassadengeruest', 1000)], 'b', '2026-03-15'); l = ab(l, 'b')
  l = erfasse(l, [P('Fassadengeruest', 1200)], 'c', '2026-04-01'); l = ab(l, 'c')
  return erfasse(l, [P('Fassadengeruest', 1250)], 'd', '2026-04-15')
}

describe('Aufmaß-Beleg: Daten', () => {
  it('Beispiel der Vorgabe: jetzt abrechenbar 800 / 200 / 200 / 50, bisher 0 / 800 / 1.000 / 1.200', () => {
    const l = kette()
    const ergebnis = l.map((z) => baueAufmassBeleg(z, l, 'kumuliert').zeilen[0])
    expect(ergebnis.map((r) => r.bisher)).toEqual([0, 800, 1000, 1200])
    expect(ergebnis.map((r) => r.neu)).toEqual([800, 200, 200, 50])
    expect(ergebnis.map((r) => r.kumuliert)).toEqual([800, 1000, 1200, 1250])
  })
  it('bereits abgerechnetes Aufmaß: frühere Periode bleibt stabil, auch wenn später weiter abgerechnet wurde', () => {
    const l = ab(kette(), 'd') // alle abgerechnet
    expect(baueAufmassBeleg(l[1], l, 'kumuliert').zeilen[0]).toMatchObject({ bisher: 800, neu: 200 })
  })
  it('Einzelaufmaß: nur Positionen mit Menge in dieser Periode, Betrag = Menge × Preis', () => {
    let l = erfasse([], [P('Gerüst', 500, undefined, 12), P('Treppe', 20, undefined, 100)], 'a'); l = ab(l, 'a')
    l = erfasse(l, [P('Gerüst', 700, undefined, 12), P('Treppe', 20, undefined, 100)], 'b')
    const b = baueAufmassBeleg(l[1], l, 'einzel')
    expect(b.zeilen.map((r) => [r.bezeichnung, r.neu, r.betrag])).toEqual([['Gerüst', 200, 2400]])
    expect(b.summePeriodeNetto).toBe(2400)
    // Gesamtansicht zeigt beide Positionen und den Gesamtwert
    const k = baueAufmassBeleg(l[1], l, 'kumuliert')
    expect(k.zeilen).toHaveLength(2)
    expect(k.summeKumuliertNetto).toBe(700 * 12 + 20 * 100)
  })
  it('Mehrmenge und zu viel abgerechnet erscheinen als Hinweis', () => {
    let l = erfasse([], [P('Gerüst', 800, 1000)], 'a'); l = ab(l, 'a')
    l = erfasse(l, [P('Gerüst', 1200)], 'b')
    expect(baueAufmassBeleg(l[1], l, 'kumuliert').hinweise.join(' ')).toMatch(/Mehrmenge 200,00 m²/)
    let r = erfasse([], [P('Gerüst', 800)], 'a'); r = ab(r, 'a')
    r = erfasse(r, [P('Gerüst', 700)], 'b', '2026-04-01', 'Rückbau')
    const b = baueAufmassBeleg(r[1], r, 'kumuliert')
    expect(b.zeilen[0]).toMatchObject({ neu: 0, zuViel: 100 })
    expect(b.hinweise.join(' ')).toMatch(/100,00 m² mehr abgerechnet/)
  })
  it('altes Aufmaß nur mit Gesamtfläche: Differenz ohne Preise', () => {
    const l: Zwischenaufmass[] = [
      { id: 'a', nr: 1, stichtag: '2026-03-01', flaecheM2: 500, notiz: '', erstelltAm: '', rechnungId: 'r', rechnungNr: 'RE-1' },
      { id: 'b', nr: 2, stichtag: '2026-04-01', flaecheM2: 700, notiz: '', erstelltAm: '' },
    ]
    const b = baueAufmassBeleg(l[1], l, 'kumuliert')
    expect(b.nurGesamtflaeche).toBe(true)
    expect(b.zeilen[0]).toMatchObject({ bisher: 500, neu: 200, betrag: 0 })
  })
})

describe('Aufmaß-Beleg: PDF', () => {
  const text = (ansicht: 'einzel' | 'kumuliert') => {
    const l = kette()
    const doc = erzeugeZwischenaufmassPdf({ kunde: 'Muster GmbH', adresse: 'Weg 1', z: l[3], liste: l, ansicht, firma: { name: 'Gerustbau Test', city: 'Vreden' } })
    return { s: doc.output(), seiten: doc.getNumberOfPages(), breit: doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight() }
  }
  it('Einzelaufmaß: Hochformat, Titel, Position und Menge dieser Periode, Unterschriftsfelder', () => {
    const { s, breit } = text('einzel')
    expect(breit).toBe(false)
    expect(s).toContain('EINZELAUFMASS'); expect(s).toContain('Fassadengeruest'); expect(s).toContain('50,00'); expect(s).toContain('AUFTRAGGEBER')
    expect(s).not.toContain('Gesamt kumuliert')
  })
  it('Kumuliertes Aufmaß: Querformat, Spalten Vertrag/kumuliert/bereits abgerechnet/jetzt abrechenbar', () => {
    const { s, breit } = text('kumuliert')
    expect(breit).toBe(true)
    for (const t of ['KUMULIERTES AUFMASS', 'Gesamt kumuliert', 'bereits abgerechnet', 'jetzt abrechenbar', '1.250,00', '1.200,00']) expect(s).toContain(t)
  })
  it('enthält keine internen Kostenbegriffe', () => {
    for (const a of ['einzel', 'kumuliert'] as const) expect(text(a).s).not.toMatch(/Marge|Selbstkosten|Einkauf/i)
  })
  it('Dateiname', () => {
    expect(zwischenaufmassPdfDateiname('ZA-04', 'kumuliert', '2026-04-15')).toBe('Aufmass-ZA-04-kumuliert-2026-04-15.pdf')
  })
})
