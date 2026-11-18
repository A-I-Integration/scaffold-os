import { describe, it, expect } from 'vitest'
import { berechneBauphasen, normalisiereBauphasen, type Bauphase } from '@/lib/bauphasen'

const einst = { gesamtFlaecheM2: 1000, preisJeM2: 10, aufbauAnteilProzent: 65, aufbauStundenGesamt: 160, abbauStundenGesamt: 80, standardPersonen: 2, stundenJeTag: 8,
  material: [{ artikel: 'R1', name: 'Rahmen', menge: 200, einheit: 'Stk' }] }
const p = (id: string, art: 'aufbau' | 'abbau', datum: string, flaecheM2: number, extra: Partial<Bauphase> = {}): Bauphase => ({ id, art, datum, flaecheM2, ...extra })

describe('berechneBauphasen', () => {
  it('65/35: Aufbau 65 %, Abbau 35 %, Summe = Soll', () => {
    const r = berechneBauphasen([p('a', 'aufbau', '2026-11-02', 1000), p('b', 'abbau', '2026-12-07', 1000)], einst)
    expect(r.summeAufbau).toBe(6500); expect(r.summeAbbau).toBe(3500); expect(r.summeBetrag).toBe(10000); expect(r.abweichung).toBe(0)
  })
  it('mehrere Termine und Teilrückbau: Beträge nach m²', () => {
    const r = berechneBauphasen([p('a1', 'aufbau', '2026-11-02', 600), p('a2', 'aufbau', '2026-11-16', 400), p('b1', 'abbau', '2026-12-01', 250), p('b2', 'abbau', '2026-12-15', 750)], einst)
    expect(r.phasen.map((x) => x.betrag)).toEqual([3900, 2600, 875, 2625])
    expect(r.bestand.map((x) => x.stehendM2)).toEqual([600, 1000, 750, 0])
    expect(r.warnungen).toEqual([])
  })
  it('Handwerte: anderer Prozentsatz und fester Betrag', () => {
    const r = berechneBauphasen([p('a', 'aufbau', '2026-11-02', 1000, { anteilProzentManuell: 70 }), p('b', 'abbau', '2026-12-07', 1000, { betragManuell: 3000 })], einst)
    expect(r.phasen[0].betrag).toBe(7000); expect(r.phasen[1].betrag).toBe(3000); expect(r.phasen[1].anteilProzent).toBeNull()
  })
  it('Stunden, Tage und Personal: 160 h Aufbau, 2 Personen = 10 Arbeitstage, nur Mo–Fr', () => {
    const r = berechneBauphasen([p('a', 'aufbau', '2026-11-02', 1000)], einst) // Mo
    expect(r.phasen[0].stunden).toBe(160); expect(r.phasen[0].tage).toBe(10)
    expect(r.phasen[0].einsatzTage[0]).toBe('2026-11-02'); expect(r.phasen[0].einsatzTage[9]).toBe('2026-11-13')
    expect(r.personal.every((t) => t.koepfe === 2)).toBe(true)
  })
  it('Lager: Aufbau entnimmt, Abbau bringt zurück', () => {
    const r = berechneBauphasen([p('a', 'aufbau', '2026-11-02', 1000), p('b', 'abbau', '2026-12-07', 500)], einst)
    expect(r.lager.find((l) => l.datum === '2026-11-02')!.draussen).toBe(200)
    expect(r.lager.find((l) => l.datum === '2026-12-07')!.draussen).toBe(100)
  })
  it('Warnung: mehr Abbau als aufgebaut, fehlende Fläche', () => {
    const r = berechneBauphasen([p('a', 'aufbau', '2026-11-02', 300), p('b', 'abbau', '2026-11-10', 500)], einst)
    expect(r.warnungen.some((w) => w.includes('erst 300'))).toBe(true)
    expect(berechneBauphasen([p('a', 'aufbau', '2026-11-02', 10)], {}).warnungen.some((w) => w.includes('Gesamtfläche fehlt'))).toBe(true)
  })
  it('normalisiere verwirft Müll', () => {
    expect(normalisiereBauphasen([{ id: 'x', art: 'aufbau', datum: '2026-11-02', flaecheM2: 5 }, { art: 'foo' }, null])).toHaveLength(1)
  })
})

import { baueBauphasenPosition, markiereBauphaseAbgerechnet } from '@/lib/bauphasen'
describe('Rechnungsposition aus Bauphase', () => {
  it('Aufbau 600 m² bei 65 % → 600 m² × 6,50 €', () => {
    const phasen = [p('a1', 'aufbau', '2026-11-02', 600)]
    const r = berechneBauphasen(phasen, einst)
    const pos = baueBauphasenPosition(phasen[0], r.phasen[0]).position!
    expect(pos.menge).toBe(600); expect(pos.einheit).toBe('m²'); expect(pos.einzelpreis).toBe(6.5)
  })
  it('fester Betrag und Rundung → Pauschale; abgerechnete Phase gesperrt', () => {
    const phasen = [p('b', 'abbau', '2026-12-01', 250, { betragManuell: 1234.57 })]
    const r = berechneBauphasen(phasen, einst)
    const pos = baueBauphasenPosition(phasen[0], r.phasen[0]).position!
    expect(pos.einheit === 'Pauschale' ? pos.einzelpreis : pos.menge * pos.einzelpreis).toBeCloseTo(1234.57, 2)
    const neu = markiereBauphaseAbgerechnet(phasen, 'b', { id: 'r1', nummer: 'RE-1' }, '2026-12-02')
    expect(baueBauphasenPosition(neu[0], r.phasen[0]).fehler).toContain('RE-1')
    expect(normalisiereBauphasen(neu)[0].rechnungNr).toBe('RE-1')
  })
})

import { loesePhasenMengen, zeileM2, zeilenM2, normalisiereBauphasen as norm2, baueBauphasenPosition as pos2, berechneBauphasen as ber2 } from '@/lib/bauphasen'
describe('Aufmaßblatt je Phase: Seite, Startpunkt, Länge × Höhe', () => {
  const aufbau = { id: 'a', art: 'aufbau' as const, datum: '2026-11-02', flaecheM2: 0, zeilen: [{ seite: 'N' as const, start: 'unten-links' as const, laengeM: 10, hoeheM: 2 }, { seite: 'O' as const, start: 'unten-links' as const, laengeM: 8, hoeheM: 2 }] }
  it('m² = Summe Länge × Höhe', () => {
    expect(zeileM2(aufbau.zeilen[0])).toBe(20)
    expect(zeilenM2(aufbau.zeilen)).toBe(36)
    expect(loesePhasenMengen([aufbau])[0].flaecheM2).toBe(36)
  })
  it('Teilabbau über Zeilen, Gesamtabbau = Rest', () => {
    const teil = { id: 't', art: 'abbau' as const, datum: '2026-11-10', flaecheM2: 0, zeilen: [{ seite: 'N' as const, start: 'unten-links' as const, laengeM: 10, hoeheM: 2 }] }
    const gesamt = { id: 'g', art: 'abbau' as const, datum: '2026-11-20', flaecheM2: 0, gesamt: true }
    const r = loesePhasenMengen([gesamt, teil, aufbau])
    expect(r.find((p) => p.id === 't')?.flaecheM2).toBe(20)
    expect(r.find((p) => p.id === 'g')?.flaecheM2).toBe(16) // 36 aufgebaut − 20 zurückgebaut
  })
  it('weiterer Aufbau vor dem Gesamtabbau erhöht den Rest; nie negativ', () => {
    const noch = { id: 'b', art: 'aufbau' as const, datum: '2026-11-12', flaecheM2: 10 }
    const gesamt = { id: 'g', art: 'abbau' as const, datum: '2026-11-20', flaecheM2: 0, gesamt: true }
    expect(loesePhasenMengen([aufbau, noch, gesamt]).find((p) => p.id === 'g')?.flaecheM2).toBe(46)
    expect(loesePhasenMengen([gesamt]).find((p) => p.id === 'g')?.flaecheM2).toBe(0)
  })
  it('Betrag je Phase und Rechnungsposition nennen Seite, Start und Maße', () => {
    const e = { gesamtFlaecheM2: 36, preisJeM2: 10, aufbauAnteilProzent: 65 }
    const erg = ber2([aufbau], e)
    expect(erg.phasen[0].betrag).toBe(234) // 36 × 10 × 65 %
    const { position, fehler } = pos2(aufbau, erg.phasen[0])
    expect(fehler).toBeNull()
    expect(position?.bezeichnung).toMatch(/Aufbau am 2\.11\.2026: 36,00 m²/)
    expect(position?.bezeichnung).toMatch(/Nord unten links 10,00 m × 2,00 m; Ost unten links 8,00 m × 2,00 m/)
  })
  it('Gesamtabbau wird als solcher bezeichnet, Zeilen und Flag überstehen Speichern und Lesen', () => {
    const g = { id: 'g', art: 'abbau' as const, datum: '2026-11-20', flaecheM2: 0, gesamt: true }
    const gelesen = norm2(JSON.parse(JSON.stringify([aufbau, g])))
    expect(gelesen[0].zeilen).toHaveLength(2)
    expect(gelesen[1].gesamt).toBe(true)
    const erg = ber2(gelesen, { gesamtFlaecheM2: 36, preisJeM2: 10 })
    expect(pos2(gelesen[1], erg.phasen.find((p) => p.id === 'g')!).position?.bezeichnung).toMatch(/^Gesamtabbau \(Rest\) am 20\.11\.2026: 36,00 m²/)
  })
})
