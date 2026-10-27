import { describe, it, expect } from 'vitest'
import { normalisiereNachtraege, neuerNachtrag, verlaengerungBetrag, regieBetrag, regieStunden, artFehlt, nachtragPositionen } from '../nachtrag'
import { baueRechnungsPositionen, summeNetto } from '../schlussrechnung'

const basis = { datum: '2026-10-22', titel: 'Verlängerung', grund: 'Maler nicht fertig', fotos: [] }

describe('Verlängerung', () => {
  it('Betrag = Wochen × Preis', () => expect(verlaengerungBetrag({ wochen: 6, preisProWoche: 120.5 })).toBe(723))
  it('Rechnungsposition in Wochen', () => {
    const n = neuerNachtrag([], { ...basis, betrag: 723, art: 'verlaengerung', verlaengerung: { wochen: 6, preisProWoche: 120.5, bis: '2026-12-01' } }, 'a')
    const p = nachtragPositionen(n)
    expect(p).toHaveLength(1); expect(p[0].menge).toBe(6); expect(p[0].einheit).toBe('Wo.'); expect(p[0].einzelpreis).toBe(120.5)
    expect(p[0].bezeichnung).toContain('N-01'); expect(p[0].bezeichnung).toContain('6 Wochen')
  })
  it('Pflichtangaben', () => { expect(artFehlt('verlaengerung', { wochen: 0, preisProWoche: 0 })).toEqual(['Wochen', 'Preis je Woche']); expect(artFehlt('verlaengerung', { wochen: 2, preisProWoche: 50 })).toEqual([]) })
})

describe('Regie', () => {
  const zeilen = [{ bezeichnung: 'Umbau oben', personen: 3, stunden: 2, satz: 55 }, { bezeichnung: 'Vorarbeiter', personen: 1, stunden: 1.5, satz: 70 }]
  it('Betrag und Stunden', () => { expect(regieBetrag(zeilen)).toBe(435); expect(regieStunden(zeilen)).toBe(7.5) })
  it('eine Position je Zeile mit Stunden × Satz', () => {
    const n = neuerNachtrag([], { ...basis, betrag: 435, art: 'regie', regie: zeilen }, 'b')
    const p = nachtragPositionen(n)
    expect(p).toHaveLength(2); expect(p[0].menge).toBe(6); expect(p[0].einheit).toBe('Std.'); expect(p[0].einzelpreis).toBe(55)
    expect(summeNetto(p as any)).toBe(435)
  })
  it('Pflichtangaben je Zeile', () => expect(artFehlt('regie', undefined, [{ bezeichnung: '', personen: 3, stunden: 0, satz: 55 }])).toEqual(['Zeile 1: Bezeichnung, Stunden']))
  it('ohne Zeilen', () => expect(artFehlt('regie', undefined, [])).toEqual(['mindestens eine Zeile']))
})

describe('Speichern und Lesen', () => {
  it('Art bleibt beim Normalisieren erhalten', () => {
    const n = neuerNachtrag([], { ...basis, betrag: 435, art: 'regie', regie: [{ bezeichnung: 'x', personen: 2, stunden: 3, satz: 40 }] }, 'c')
    const r = normalisiereNachtraege(JSON.parse(JSON.stringify([n])))[0]
    expect(r.art).toBe('regie'); expect(r.regie?.[0].personen).toBe(2)
  })
  it('alter Nachtrag ohne Art bleibt Pauschale', () => {
    const n = normalisiereNachtraege([{ id: 'x', nr: 1, datum: '2026-10-01', titel: 'T', grund: 'G', betrag: 100, status: 'bestaetigt' }])[0]
    expect(nachtragPositionen(n)).toEqual([{ bezeichnung: 'Nachtrag N-01 vom 1.10.2026: T', menge: 1, einheit: 'Pauschale', einzelpreis: 100 }])
  })
  it('Schlussrechnung übernimmt Regie-Zeilen', () => {
    const n = neuerNachtrag([], { ...basis, betrag: 435, art: 'regie', regie: [{ bezeichnung: 'a', personen: 3, stunden: 2, satz: 55 }] }, 'd')
    const pos = baueRechnungsPositionen({ eingabe: { kiResult: null, preisModus: 'festpreis', festpreisProM2: '0', anpassungen: {}, kranAktiv: false, kranTage: 1, kranTagessatz: 850 }, basis: 'angebot', nachtraege: [n] })
    expect(pos.some(p => p.einheit === 'Std.' && p.menge === 6)).toBe(true)
  })
})
