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
