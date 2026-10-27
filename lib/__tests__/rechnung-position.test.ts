import { describe, it, expect } from 'vitest'
import { bereinigePosition, preisMitFaktor, positionDetailZeilen } from '@/lib/rechnung-position'

describe('bereinigePosition', () => {
  it('behält bekannte Felder und verwirft unbekannte', () => {
    const p = bereinigePosition({ bezeichnung: ' Fassade ', menge: '12,5', einheit: 'm²', einzelpreis: 8, art: 'geruest', laengeM: '12', hoeheM: 6, boese: 'x' }) as any
    expect(p).toEqual({ bezeichnung: 'Fassade', menge: 12.5, einheit: 'm²', einzelpreis: 8, art: 'geruest', laengeM: 12, hoeheM: 6 })
    expect(p.boese).toBeUndefined()
  })
  it('ungültige Art, negative Maße und Faktor 100 fallen weg', () => {
    const p = bereinigePosition({ bezeichnung: 'x', menge: 1, einheit: '', einzelpreis: 1, art: 'hack', laengeM: -3, faktorProzent: 100 })
    expect(p.art).toBeUndefined(); expect(p.laengeM).toBeUndefined(); expect(p.faktorProzent).toBeUndefined(); expect(p.einheit).toBe('Stk.')
  })
  it('Faktor und Stundenlohn-Felder werden übernommen', () => {
    const p = bereinigePosition({ bezeichnung: 'Regie', menge: 8, einheit: 'Std.', einzelpreis: 65, art: 'regie', mitarbeiter: 'A. Muster', taetigkeit: 'Schultertransport', faktorProzent: 80, listenpreis: 81.25 })
    expect(p.faktorProzent).toBe(80); expect(p.mitarbeiter).toBe('A. Muster'); expect(p.taetigkeit).toBe('Schultertransport')
  })
})

describe('preisMitFaktor', () => {
  it('80 % von 100 = 80, gerundet auf Cent', () => {
    expect(preisMitFaktor(100, 80)).toBe(80)
    expect(preisMitFaktor(10.01, 33)).toBe(3.3)
  })
})

describe('positionDetailZeilen', () => {
  it('zeigt Art, Maße, Faktor, Mitarbeiter, Tätigkeit', () => {
    const z = positionDetailZeilen({ art: 'geruest', laengeM: 12, breiteM: 9, hoeheM: 6, listenpreis: 100, faktorProzent: 80, mitarbeiter: 'A. Muster', taetigkeit: 'Aufbau' })
    expect(z[0]).toBe('Gerüst / Modul')
    expect(z[1]).toBe('L×B×H: 12 × 9 × 6 m')
    expect(z[2]).toContain('Faktor 80 %')
    expect(z[3]).toBe('Mitarbeiter: A. Muster')
    expect(z[4]).toBe('Tätigkeit: Aufbau')
  })
  it('Position ohne Details → keine Zeilen', () => {
    expect(positionDetailZeilen({ art: 'sonstiges' })).toEqual([])
  })
})

import { aktualisierePosition, mengenVorschlaege } from '@/lib/rechnung-position'

describe('aktualisierePosition', () => {
  it('rechnet Einzelpreis aus Listenpreis × Faktor und entfernt leere Felder', () => {
    let p: any = { bezeichnung: 'Modul', menge: 10, einheit: 'm²', einzelpreis: 0 }
    p = aktualisierePosition(p, 'listenpreis', '12,50')
    expect(p.einzelpreis).toBe(12.5)
    p = aktualisierePosition(p, 'faktorProzent', '80')
    expect(p.einzelpreis).toBe(10)
    p = aktualisierePosition(p, 'art', 'konsolen'); expect(p.art).toBe('konsolen')
    p = aktualisierePosition(p, 'art', ''); expect('art' in p).toBe(false)
    p = aktualisierePosition(p, 'laengeM', '12,5'); expect(p.laengeM).toBe(12.5)
    expect(p.bezeichnung).toBe('Modul')
  })
})

describe('mengenVorschlaege', () => {
  it('schlägt Fläche und Volumen vor, übernimmt nichts selbst', () => {
    const v = mengenVorschlaege({ laengeM: 12, breiteM: 2, hoeheM: 6 })
    expect(v.map((x) => x.einheit)).toEqual(['m²', 'm³'])
    expect(v[0].menge).toBe(72)
    expect(v[1].menge).toBe(144)
  })
  it('ohne Maße kein Vorschlag, nur Länge → Meter', () => {
    expect(mengenVorschlaege({})).toEqual([])
    expect(mengenVorschlaege({ laengeM: 8 })).toEqual([{ label: 'Länge = 8 m', menge: 8, einheit: 'm' }])
  })
})
