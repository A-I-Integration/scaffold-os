import { describe, it, expect } from 'vitest'
import { stueckAusGewicht, gemischteLadung, wendeBewegungenAn, buchungenFuerAbbau, sollIstVergleich } from '../gestell-waage'

describe('stueckAusGewicht', () => {
  it('rechnet 1.500 kg netto bei 15 kg je Belag auf 100 Stück', () => {
    const r = stueckAusGewicht(1700, 200, 15, 2)
    expect(r.stueck).toBe(100)
    expect(r.sicherheit).toBe('sicher')
  })
  it('erkennt die Entnahme von 20 Stück', () => {
    const vorher = stueckAusGewicht(1700, 200, 15, 2).stueck
    const nachher = stueckAusGewicht(1400, 200, 15, 2).stueck
    expect(vorher - nachher).toBe(20)
  })
  it('wird unsicher, wenn die Toleranz größer als ein halbes Stück ist', () => {
    const r = stueckAusGewicht(1692, 200, 15, 10) // Netto 1.492: 99 oder 100 Stück möglich
    expect(r.sicherheit).toBe('unsicher')
    expect(r.minStueck).toBeLessThan(r.maxStueck)
  })
  it('meldet eine Abweichung, die zu keiner ganzen Stückzahl passt', () => {
    const r = stueckAusGewicht(1500 + 7.5 + 200, 200, 15, 2)
    expect(r.sicherheit).toBe('unsicher')
    expect(r.hinweis).toContain('Abweichung')
  })
  it('meldet fehlendes Stückgewicht und Gewicht unter Leergewicht', () => {
    expect(stueckAusGewicht(100, 10, 0, 1).sicherheit).toBe('unmoeglich')
    expect(stueckAusGewicht(100, 200, 15, 1).sicherheit).toBe('unmoeglich')
  })
  it('lässt kleine negative Netto-Werte innerhalb der Toleranz als 0 Stück zu', () => {
    const r = stueckAusGewicht(199, 200, 15, 2)
    expect(r.stueck).toBe(0)
    expect(r.sicherheit).toBe('sicher')
  })
})

describe('gemischteLadung', () => {
  it('findet die eindeutige Kombination', () => {
    const k = [{ id: 'belag', gewichtKg: 20 }, { id: 'rahmen', gewichtKg: 11 }]
    const { treffer } = gemischteLadung(2 * 20 + 3 * 11, k, 0.5)
    expect(treffer).toHaveLength(1)
    expect(treffer[0].mengen).toEqual({ belag: 2, rahmen: 3 })
  })
  it('liefert mehrere Treffer, wenn Gewichte sich überschneiden', () => {
    const k = [{ id: 'a', gewichtKg: 10 }, { id: 'b', gewichtKg: 5 }]
    const { treffer } = gemischteLadung(20, k, 0.1)
    expect(treffer.length).toBeGreaterThan(1)
  })
  it('beachtet Höchstmengen aus der Materialliste', () => {
    const k = [{ id: 'a', gewichtKg: 10, max: 1 }, { id: 'b', gewichtKg: 5 }]
    const { treffer } = gemischteLadung(20, k, 0.1)
    expect(treffer.every((t) => (t.mengen.a ?? 0) <= 1)).toBe(true)
  })
  it('bricht bei zu großer Suche ab, statt zu hängen', () => {
    const k = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, gewichtKg: 3 + i * 0.37 }))
    const r = gemischteLadung(500, k, 0.2, 20, 1000)
    expect(r.abgebrochen).toBe(true)
  })
})

describe('Bewegungen', () => {
  const start = { 'Baustelle A': { belag: 100 }, Lager: { belag: 50 }, LKW: {} }
  it('Teilabbau: 20 % nach B, 80 % ins Lager, alles über den LKW', () => {
    const b = buchungenFuerAbbau('Baustelle A', 'LKW', [
      { gestellId: 'g1', ziel: 'Baustelle B', artikelId: 'belag', stueck: 20 },
      { gestellId: 'g2', ziel: 'Lager', artikelId: 'belag', stueck: 80 },
    ])
    const r = wendeBewegungenAn({ ...start, 'Baustelle B': {} }, b)
    expect(r.fehler).toEqual([])
    expect(r.bestand['Baustelle A'].belag).toBe(0)
    expect(r.bestand['Baustelle B'].belag).toBe(20)
    expect(r.bestand.Lager.belag).toBe(130)
    expect(r.bestand.LKW.belag).toBe(0)
  })
  it('fasst gleiche Ziele zusammen', () => {
    const b = buchungenFuerAbbau('A', 'LKW', [
      { gestellId: 'g1', ziel: 'Lager', artikelId: 'x', stueck: 5 },
      { gestellId: 'g2', ziel: 'Lager', artikelId: 'x', stueck: 7 },
    ])
    expect(b).toEqual([{ von: 'A', nach: 'LKW', artikelId: 'x', stueck: 12 }, { von: 'LKW', nach: 'Lager', artikelId: 'x', stueck: 12 }])
  })
  it('bucht nichts, wenn der Bestand nicht reicht', () => {
    const r = wendeBewegungenAn(start, [{ von: 'Baustelle A', nach: 'LKW', artikelId: 'belag', stueck: 101 }])
    expect(r.fehler).toHaveLength(1)
    expect(r.bestand).toBe(start)
  })
  it('lehnt Menge 0, Kommazahl und gleichen Ort ab', () => {
    expect(wendeBewegungenAn(start, [{ von: 'Lager', nach: 'LKW', artikelId: 'belag', stueck: 0 }]).fehler).toHaveLength(1)
    expect(wendeBewegungenAn(start, [{ von: 'Lager', nach: 'LKW', artikelId: 'belag', stueck: 1.5 }]).fehler).toHaveLength(1)
    expect(wendeBewegungenAn(start, [{ von: 'Lager', nach: 'Lager', artikelId: 'belag', stueck: 1 }]).fehler).toHaveLength(1)
  })
})

describe('sollIstVergleich', () => {
  it('zeigt Differenzen je Artikel', () => {
    const v = sollIstVergleich({ belag: 200, rahmen: 10 }, [{ gestellId: 'g', ziel: 'B', artikelId: 'belag', stueck: 187 }])
    expect(v.find((x) => x.artikelId === 'belag')?.differenz).toBe(-13)
    expect(v.find((x) => x.artikelId === 'rahmen')?.differenz).toBe(-10)
  })
})
