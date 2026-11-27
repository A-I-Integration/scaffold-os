import { describe, it, expect } from 'vitest'
import { pruefeZaehlAntwort, bauePositionsVorschlaege, addiereVorschlaege } from '../ki-zaehlen'

const P = [{ id: 'a', mengeVorOrt: 40 }, { id: 'b', mengeVorOrt: 10 }, { id: 'c', mengeVorOrt: 5 }]
describe('Zählantwort bereinigen', () => {
  it('nimmt nur gültige Nummern, jede einmal, Anzahl nur als ganze Zahl', () => {
    const e = pruefeZaehlAntwort({ zaehlung: [{ nr: 1, anzahl: 12, sicherheit: 'hoch' }, { nr: 1, anzahl: 99 }, { nr: 4, anzahl: 3 }, { nr: 0, anzahl: 3 }, { nr: 2, anzahl: 2.5 }, { nr: '3', anzahl: '4', sicherheit: 'bunt' }, 'x', null], hinweis: ' Foto unscharf ' }, 3)
    expect(e.zaehlung).toEqual([{ nr: 1, anzahl: 12, sicherheit: 'hoch' }, { nr: 2, anzahl: null, sicherheit: 'niedrig' }, { nr: 3, anzahl: 4, sicherheit: 'niedrig' }])
    expect(e.hinweis).toBe('Foto unscharf')
  })
  it('Müll hinein: leer heraus', () => { expect(pruefeZaehlAntwort('hallo', 3)).toEqual({ zaehlung: [], hinweis: null }); expect(pruefeZaehlAntwort(null, 3).zaehlung).toEqual([]) })
  it('negative und riesige Zahlen werden verworfen', () => {
    expect(pruefeZaehlAntwort({ zaehlung: [{ nr: 1, anzahl: -3 }, { nr: 2, anzahl: 1e9 }] }, 3).zaehlung.map((z) => z.anzahl)).toEqual([null, null])
  })
})
describe('Vorschläge je Position', () => {
  it('ordnet nach Reihenfolge zu, kappt auf die Menge vor Ort und lässt Nicht-Erkanntes leer', () => {
    const v = bauePositionsVorschlaege({ zaehlung: [{ nr: 1, anzahl: 12, sicherheit: 'hoch' }, { nr: 2, anzahl: 30, sicherheit: 'mittel' }], hinweis: null }, P)
    expect(v[0]).toMatchObject({ id: 'a', anzahl: 12, gekappt: false })
    expect(v[1]).toMatchObject({ id: 'b', anzahl: 10, gekappt: true, sicherheit: 'mittel' })
    expect(v[2]).toMatchObject({ id: 'c', anzahl: null })
  })
  it('weitere Fotos werden addiert und gedeckelt', () => {
    const e1 = bauePositionsVorschlaege({ zaehlung: [{ nr: 1, anzahl: 30, sicherheit: 'hoch' }], hinweis: null }, P)
    const e2 = bauePositionsVorschlaege({ zaehlung: [{ nr: 1, anzahl: 20, sicherheit: 'hoch' }, { nr: 3, anzahl: 2, sicherheit: 'hoch' }], hinweis: null }, P)
    const s1 = addiereVorschlaege({}, e1, P)
    expect(s1).toEqual({ a: 30, b: 0, c: 0 })
    expect(addiereVorschlaege(s1, e2, P)).toEqual({ a: 40, b: 0, c: 2 })
  })
})
