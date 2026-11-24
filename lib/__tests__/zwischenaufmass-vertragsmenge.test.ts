import { describe, it, expect } from 'vitest'
import {
  neuesZwischenaufmassJePosition, zaZeilen, markiereAbgerechnet, baueTeilleistungsPositionen, normalisiereZwischenaufmasse,
  type Zwischenaufmass, type ZaPositionEingabe,
} from '../zwischenaufmass'
import { pruefeAufmassAenderung, aufmassStand } from '../aufmass-integritaet'

// Schritt 2 des kumulierten Aufmaßes: Vertragsmenge je Position, Mehrmengen-Warnung.
const P = (menge: number, vertragsmenge?: number, bezeichnung = 'Fassadengerüst'): ZaPositionEingabe => ({ bezeichnung, einheit: 'm²', einzelpreis: 10, menge, ...(vertragsmenge !== undefined ? { vertragsmenge } : {}) })
const erfasse = (liste: Zwischenaufmass[], pos: ZaPositionEingabe[], id: string, notiz = '') => {
  const r = neuesZwischenaufmassJePosition(liste, { stichtag: '2026-03-01', positionen: pos, notiz }, id)
  if (!r.ok) throw new Error(r.fehler)
  return [...liste, r.eintrag]
}
const ab = (l: Zwischenaufmass[], id: string) => markiereAbgerechnet(l, id, { id: 'r-' + id, nummer: 'RE-1' }, '2026-03-02')

describe('Vertragsmenge je Position', () => {
  it('wird gespeichert und bei den Folgeständen übernommen, wenn nichts angegeben wird', () => {
    const l = erfasse(erfasse([], [P(500, 1000)], 'a'), [P(700)], 'b')
    expect(l[1].positionen![0].vertragsmenge).toBe(1000)
  })
  it('ohne Vertragsmenge keine Mengenprüfung und keine Mehrmenge', () => {
    const l = erfasse([], [P(5000)], 'a')
    expect(zaZeilen(l[0], l)[0]).toMatchObject({ mehrmenge: 0, neuMehrmenge: 0 })
    expect(l[0].positionen![0].vertragsmenge).toBeUndefined()
  })
  it('Mehrmenge: 1.200 aufgemessen bei 1.000 vereinbart, 800 abgerechnet → neu 400, davon 200 Mehrmenge', () => {
    const l = erfasse(ab(erfasse([], [P(800, 1000)], 'a'), 'a'), [P(1200)], 'b')
    expect(zaZeilen(l[1], l)[0]).toMatchObject({ bisher: 800, neu: 400, mehrmenge: 200, neuMehrmenge: 200 })
  })
  it('Mehrmenge schon abgerechnet: nur der Zuwachs darüber zählt als neue Mehrmenge', () => {
    let l = erfasse(erfasse([], [P(800, 1000)], 'a'), [P(1200)], 'b'); l = ab(ab(l, 'a'), 'b')
    l = erfasse(l, [P(1250)], 'c')
    expect(zaZeilen(l[2], l)[0]).toMatchObject({ bisher: 1200, neu: 50, mehrmenge: 250, neuMehrmenge: 50 })
  })
  it('innerhalb der Vertragsmenge: keine Mehrmenge, keine Warnung', () => {
    const l = erfasse(ab(erfasse([], [P(800, 1000)], 'a'), 'a'), [P(1000)], 'b')
    expect(zaZeilen(l[1], l)[0]).toMatchObject({ neu: 200, mehrmenge: 0, neuMehrmenge: 0 })
    expect(baueTeilleistungsPositionen(l[1], l).hinweise).toEqual([])
  })
  it('Rechnungsbau liefert eine Mehrmengen-Warnung, rechnet die Mengen aber unverändert (Differenz zum Abgerechneten)', () => {
    const l = erfasse(ab(erfasse([], [P(800, 1000)], 'a'), 'a'), [P(1200)], 'b')
    const r = baueTeilleistungsPositionen(l[1], l)
    expect(r.positionen[0].menge).toBe(400)
    expect(r.hinweise.join(' ')).toMatch(/Mehrmenge 200,00 m².*200,00 m² in dieser Rechnung.*Nachtrag/)
  })
  it('Vertragsmenge ändern braucht eine Notiz; mit Notiz geht es; erstmaliges Setzen braucht keine', () => {
    const l = erfasse([], [P(500, 1000)], 'a')
    const ohne = neuesZwischenaufmassJePosition(l, { stichtag: '2026-04-01', positionen: [P(600, 1200)], notiz: '' }, 'b')
    expect(ohne.ok).toBe(false)
    expect(erfasse(l, [P(600, 1200)], 'b', 'Nachtrag 1 genehmigt')[1].positionen![0].vertragsmenge).toBe(1200)
    const erstmals = erfasse([], [P(500)], 'a')
    expect(erfasse(erstmals, [P(600, 1000)], 'b')[1].positionen![0].vertragsmenge).toBe(1000)
  })
  it('Nur Vertragsmenge geändert (mit Notiz) zählt als Änderung, nicht als „nichts Neues"', () => {
    const l = erfasse([], [P(500, 1000)], 'a')
    expect(erfasse(l, [P(500, 1200)], 'b', 'Nachtrag').length).toBe(2)
  })
  it('ungültige Vertragsmenge wird abgelehnt', () => {
    for (const v of [-1, NaN]) {
      expect(neuesZwischenaufmassJePosition([], { stichtag: '2026-03-01', positionen: [P(5, v)] }, 'a').ok).toBe(false)
    }
  })
  it('entfallene Position (Menge 0) behält ihre Vertragsmenge', () => {
    const l = erfasse(erfasse([], [P(500, 1000), P(100, 100, 'Treppe')], 'a'), [P(600)], 'b', 'Treppe entfällt')
    expect(l[1].positionen!.find((p) => p.bezeichnung === 'Treppe')).toMatchObject({ menge: 0, vertragsmenge: 100 })
  })
  it('Lesen gespeicherter Daten: Vertragsmenge bleibt, alte Daten ohne sie bleiben gültig', () => {
    const roh = JSON.parse(JSON.stringify(erfasse([], [P(500, 1000)], 'a')))
    expect(normalisiereZwischenaufmasse(roh)[0].positionen![0].vertragsmenge).toBe(1000)
    delete roh[0].positionen[0].vertragsmenge
    expect(normalisiereZwischenaufmasse(roh)[0].positionen![0].vertragsmenge).toBeUndefined()
  })
  it('Fingerabdruck ändert sich mit der Vertragsmenge', () => {
    const a = erfasse([], [P(500, 1000)], 'a')[0]; const b = erfasse([], [P(500, 1200)], 'a')[0]
    expect(aufmassStand(a)).not.toBe(aufmassStand(b))
  })
})

describe('Server: Vertragsmenge nicht still ändern', () => {
  it('neues Zwischenaufmaß mit geänderter Vertragsmenge ohne Notiz wird abgelehnt, mit Notiz akzeptiert', () => {
    const alt = erfasse([], [P(500, 1000)], 'a')
    const neuOhne = JSON.parse(JSON.stringify([...alt, { ...alt[0], id: 'b', nr: 2, positionen: [{ ...alt[0].positionen![0], menge: 600, vertragsmenge: 5000 }], notiz: '' }]))
    expect(pruefeAufmassAenderung(alt, neuOhne)).toMatch(/Vertragsmenge/)
    neuOhne[1].notiz = 'Nachtrag'
    expect(pruefeAufmassAenderung(alt, neuOhne)).toBeNull()
  })
  it('Vertragsmenge eines abgerechneten Zwischenaufmaßes ist nicht nachträglich änderbar', () => {
    const alt = ab(erfasse([], [P(500, 1000)], 'a'), 'a')
    const neu = JSON.parse(JSON.stringify(alt)); neu[0].positionen[0].vertragsmenge = 9999
    expect(pruefeAufmassAenderung(alt, neu)).toMatch(/kann nicht geändert werden/)
  })
})
