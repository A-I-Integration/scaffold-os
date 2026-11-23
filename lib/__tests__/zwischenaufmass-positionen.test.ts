import { describe, it, expect } from 'vitest'
import {
  neuesZwischenaufmassJePosition, baueTeilleistungsPositionen, zaZeilen, aenderungenZwischenaufmasse,
  normalisiereZwischenaufmasse, markiereAbgerechnet, type Zwischenaufmass,
} from '../zwischenaufmass'

const P = (bezeichnung: string, menge: number, einzelpreis = 10, einheit = 'm²') => ({ bezeichnung, einheit, einzelpreis, menge })
const erst = (liste: Zwischenaufmass[], pos: ReturnType<typeof P>[], id: string, notiz = '', stichtag = '2026-03-01') => {
  const r = neuesZwischenaufmassJePosition(liste, { stichtag, positionen: pos, notiz }, id)
  if (!r.ok) throw new Error(r.fehler)
  return [...liste, r.eintrag]
}

describe('Aufmaß je Position, kumuliert', () => {
  it('rechnet je Position nur die Differenz zum bereits Abgerechneten', () => {
    let l = erst([], [P('Fassade Süd', 100), P('Fassade Nord', 50)], 'a')
    expect(baueTeilleistungsPositionen(l[0], l).positionen.map((p) => p.menge)).toEqual([100, 50])
    l = markiereAbgerechnet(l, 'a', { id: 'r1', nummer: 'RE-1' }, '2026-03-02')
    l = erst(l, [P('Fassade Süd', 160), P('Fassade Nord', 50)], 'b', '', '2026-04-01')
    const r = baueTeilleistungsPositionen(l[1], l)
    expect(r.fehler).toBeNull()
    expect(r.positionen).toHaveLength(1)
    expect(r.positionen[0]).toMatchObject({ menge: 60, einzelpreis: 10, einheit: 'm²' })
    expect(r.positionen[0].bezeichnung).toContain('abzüglich bereits abgerechnet 100,00')
  })
  it('liefert nichts, wenn alles schon abgerechnet ist', () => {
    let l = erst([], [P('A', 10)], 'a'); l = markiereAbgerechnet(l, 'a', { id: 'r', nummer: 'RE-1' }, '2026-03-02')
    l = erst(l, [P('A', 10), P('B', 0)], 'b')
    expect(baueTeilleistungsPositionen(l[1], l).fehler).toMatch(/keine neue Menge/)
  })
  it('Rückgang unter abgerechneter Menge wird nicht still verrechnet, sondern als Hinweis geführt', () => {
    let l = erst([], [P('A', 100)], 'a'); l = markiereAbgerechnet(l, 'a', { id: 'r', nummer: 'RE-1' }, '2026-03-02')
    l = erst(l, [P('A', 80), P('B', 5)], 'b', 'Rückbau Westseite')
    const r = baueTeilleistungsPositionen(l[1], l)
    expect(r.positionen.map((p) => p.menge)).toEqual([5])
    expect(r.hinweise[0]).toMatch(/20,00 m² mehr abgerechnet/)
    expect(zaZeilen(l[1], l)[0].zuViel).toBe(20)
  })
  it('Rückgang ohne Notiz, doppelte Position, ohne Änderung und fehlender Preis werden abgelehnt', () => {
    const l = erst([], [P('A', 100)], 'a')
    expect(neuesZwischenaufmassJePosition(l, { stichtag: '2026-04-01', positionen: [P('A', 90)] }, 'x')).toMatchObject({ ok: false })
    expect(neuesZwischenaufmassJePosition(l, { stichtag: '2026-04-01', positionen: [P('A', 90)], notiz: 'Korrektur' }, 'x').ok).toBe(true)
    expect(neuesZwischenaufmassJePosition(l, { stichtag: '2026-04-01', positionen: [P('A', 1), P(' a ', 2)] }, 'x')).toMatchObject({ ok: false })
    expect(neuesZwischenaufmassJePosition(l, { stichtag: '2026-04-01', positionen: [P('A', 100)] }, 'x')).toMatchObject({ ok: false })
    const o = erst([], [P('A', 5, 0)], 'o')
    expect(baueTeilleistungsPositionen(o[0], o).fehler).toMatch(/Preis/)
  })
  it('Fläche = Summe der m²-Positionen; alte Zwischenaufmaße ohne Positionen bleiben lesbar', () => {
    const l = erst([], [P('A', 10), P('B', 5), P('Plane', 3, 4, 'Stk.')], 'a')
    expect(l[0].flaecheM2).toBe(15)
    expect(normalisiereZwischenaufmasse([{ id: 'x', nr: 1, stichtag: '2026-01-01', flaecheM2: 50 }])[0].positionen).toBeUndefined()
  })
})

describe('Änderungsverlauf der Zwischenaufmaße', () => {
  it('erfasst, abgerechnet, gelöscht mit Mengen von → auf', () => {
    const a = erst([], [P('A', 100)], 'a')
    const b = erst(a, [P('A', 150)], 'b', 'Ost fertig')
    const e1 = aenderungenZwischenaufmasse(a, b)
    expect(e1).toHaveLength(1)
    expect(e1[0]).toMatchObject({ aktion: 'aufmass_erfasst', nr: 'ZA-02', notiz: 'Ost fertig' })
    expect(e1[0].positionen[0]).toMatchObject({ von: 100, auf: 150 })
    const c = markiereAbgerechnet(b, 'b', { id: 'r', nummer: 'RE-9' }, '2026-04-02')
    expect(aenderungenZwischenaufmasse(b, c)[0]).toMatchObject({ aktion: 'aufmass_abgerechnet', rechnungNr: 'RE-9' })
    expect(aenderungenZwischenaufmasse(b, a)[0]).toMatchObject({ aktion: 'aufmass_geloescht', nr: 'ZA-02' })
    expect(aenderungenZwischenaufmasse(a, a)).toEqual([])
  })
})
