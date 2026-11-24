import { describe, it, expect } from 'vitest'
import {
  neuesZwischenaufmassJePosition, zaZeilen, normalisiereZwischenaufmasse, markiereAbgerechnet, aktuellerStandJePosition,
  type Zwischenaufmass, type ZaPositionEingabe,
} from '../zwischenaufmass'
import { pruefeAufmassAenderung } from '../aufmass-integritaet'

// Schritt 1 des kumulierten Aufmaßes: eine Position behält ihre Identität, auch wenn ihre Bezeichnung geändert wird.
// Vorher wurde die Identität bei jedem Lesen aus Bezeichnung und Einheit gebildet: eine umbenannte Position galt als neu, ihre abgerechnete Menge als 0.
const P = (bezeichnung: string, menge: number, key?: string, einzelpreis = 10, einheit = 'm²'): ZaPositionEingabe => ({ bezeichnung, einheit, einzelpreis, menge, ...(key ? { key } : {}) })
const erst = (liste: Zwischenaufmass[], pos: ZaPositionEingabe[], id: string, notiz = '') => {
  const r = neuesZwischenaufmassJePosition(liste, { stichtag: '2026-03-01', positionen: pos, notiz }, id)
  if (!r.ok) throw new Error(r.fehler)
  return [...liste, r.eintrag]
}
const abgerechnet = (l: Zwischenaufmass[], id: string) => markiereAbgerechnet(l, id, { id: 'r-' + id, nummer: 'RE-1' }, '2026-03-02')
const basis = () => abgerechnet(erst([], [P('Fassadengerüst', 800)], 'a'), 'a')
const keyVon = (l: Zwischenaufmass[], name: string) => [...aktuellerStandJePosition(l).values()].find((p) => p.bezeichnung === name)!.key

describe('Stabile Positions-ID beim kumulierten Aufmaß', () => {
  it('umbenannte Position (Identität übernommen): nur die Differenz ist abrechenbar, nicht die ganze Menge', () => {
    const l = erst(basis(), [P('Fassadengerüst Nord', 1000, keyVon(basis(), 'Fassadengerüst'))], 'b')
    const z = zaZeilen(l[1], l)[0]
    expect(z).toMatchObject({ bezeichnung: 'Fassadengerüst Nord', bisher: 800, neu: 200 })
  })

  it('Umbenennung ohne übernommene Identität: die alte Position fällt weg, das verlangt eine Begründung (kein stilles Doppelabrechnen)', () => {
    const r = neuesZwischenaufmassJePosition(basis(), { stichtag: '2026-04-01', positionen: [P('Fassadengerüst Nord', 1000)], notiz: '' }, 'b')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toMatch(/Fassadengerüst/)
    expect(r.ok === false && r.fehler).toMatch(/Notiz|Begründung/)
  })

  it('fehlende Position mit Begründung: wird mit Menge 0 geführt und bleibt sichtbar', () => {
    const l = erst(basis(), [P('Fassadengerüst Nord', 1000)], 'b', 'Position umbenannt, Fassade Nord')
    const alt = l[1].positionen!.find((p) => p.bezeichnung === 'Fassadengerüst')
    expect(alt).toMatchObject({ menge: 0 })
  })

  it('neue Position mit dem früheren Namen einer umbenannten Position ist eine NEUE Position (eigene Identität, keine Verwechslung)', () => {
    const l1 = erst(basis(), [P('Fassadengerüst Nord', 1000, keyVon(basis(), 'Fassadengerüst'))], 'b')
    const l2 = erst(abgerechnet(l1, 'b'), [P('Fassadengerüst Nord', 1000, keyVon(l1, 'Fassadengerüst Nord')), P('Fassadengerüst', 50)], 'c')
    const zeilen = zaZeilen(l2[2], l2)
    expect(zeilen.find((r) => r.bezeichnung === 'Fassadengerüst Nord')).toMatchObject({ bisher: 1000, neu: 0 })
    expect(zeilen.find((r) => r.bezeichnung === 'Fassadengerüst')).toMatchObject({ bisher: 0, neu: 50 })
    expect(new Set(l2[2].positionen!.map((p) => p.key)).size).toBe(2)
  })

  it('gleicher Name in zwei Zeilen wird auch bei verschiedener Identität abgelehnt', () => {
    const r = neuesZwischenaufmassJePosition([], { stichtag: '2026-03-01', positionen: [P('A', 1, 'x1'), P('A', 2, 'x2')], notiz: '' }, 'a')
    expect(r.ok).toBe(false)
  })

  it('eine mitgesendete Identität, die es nicht gibt, wird nicht übernommen (neue Position)', () => {
    const l = erst(basis(), [P('Fassadengerüst', 800, 'erfunden'), P('Anbau', 10, 'gibt-es-nicht')], 'b')
    expect(l[1].positionen!.map((p) => p.key)).not.toContain('erfunden')
    expect(zaZeilen(l[1], l).find((r) => r.bezeichnung === 'Fassadengerüst')).toMatchObject({ bisher: 800, neu: 0 })
  })

  it('gespeicherte Identität überlebt das erneute Lesen auch bei geänderter Bezeichnung; Altdaten ohne Identität behalten die bisherige', () => {
    const l = erst(basis(), [P('Fassadengerüst Nord', 1000, keyVon(basis(), 'Fassadengerüst'))], 'b')
    const gelesen = normalisiereZwischenaufmasse(JSON.parse(JSON.stringify(l)))
    expect(gelesen[1].positionen![0].key).toBe(l[0].positionen![0].key)
    const altdaten = normalisiereZwischenaufmasse([{ id: 'z', nr: 1, stichtag: '2026-01-01', flaecheM2: 5, positionen: [{ bezeichnung: ' Gerüst  Süd ', einheit: 'm²', einzelpreis: 1, menge: 5 }] }])
    expect(altdaten[0].positionen![0].key).toBe('gerüst süd|m²')
  })
})

describe('Serverseite: Speichern eines Zwischenaufmaßes über die Projekt-Route', () => {
  const roh = (l: Zwischenaufmass[]) => JSON.parse(JSON.stringify(l))
  const neuesZa = (id: string, positionen: object[], notiz = '') => ({ id, nr: 2, stichtag: '2026-04-01', flaecheM2: 0, notiz, erstelltAm: '2026-04-01T00:00:00Z', positionen })
  it('neues Zwischenaufmaß ohne die abgerechnete Position und ohne Begründung wird abgelehnt', () => {
    const alt = roh(basis())
    const neu = [...alt, neuesZa('b', [{ bezeichnung: 'Fassadengerüst Nord', einheit: 'm²', einzelpreis: 10, menge: 1000 }])]
    expect(pruefeAufmassAenderung(alt, neu)).toMatch(/Fassadengerüst/)
  })
  it('mit Begründung oder mit übernommener Identität wird es angenommen', () => {
    const alt = roh(basis())
    const mitGrund = [...alt, neuesZa('b', [{ bezeichnung: 'Fassadengerüst Nord', einheit: 'm²', einzelpreis: 10, menge: 1000 }], 'umbenannt')]
    expect(pruefeAufmassAenderung(alt, mitGrund)).toBeNull()
    const key = alt[0].positionen[0].key
    const mitKey = [...alt, neuesZa('b', [{ key, bezeichnung: 'Fassadengerüst Nord', einheit: 'm²', einzelpreis: 10, menge: 1000 }])]
    expect(pruefeAufmassAenderung(alt, mitKey)).toBeNull()
  })
  it('Rückgang ohne Begründung wird auch serverseitig abgelehnt', () => {
    const alt = roh(basis())
    const key = alt[0].positionen[0].key
    const neu = [...alt, neuesZa('b', [{ key, bezeichnung: 'Fassadengerüst', einheit: 'm²', einzelpreis: 10, menge: 700 }])]
    expect(pruefeAufmassAenderung(alt, neu)).toMatch(/kleiner/)
  })
})
