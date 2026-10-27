import { describe, it, expect } from 'vitest'
import { berechneBaustellenErgebnis } from '../baustellen-ergebnis'

const z = [
  { id: 'a', name: 'A. Muster', stunden: 10, satz: 30, spesen: 20 },
  { id: 'b', name: 'B. Beispiel', stunden: 5, satz: 40 },
]

describe('berechneBaustellenErgebnis', () => {
  it('rechnet Personalkosten, Spesen und Ergebnis', () => {
    const r = berechneBaustellenErgebnis({ erloesNetto: 1000, auftragswertNetto: 2000, zeilen: z })
    expect(r.stunden).toBe(15)
    expect(r.personalkosten).toBe(500) // 300 + 200
    expect(r.spesen).toBe(20)
    expect(r.kostenGesamt).toBe(520)
    expect(r.ergebnis).toBe(480)
    expect(r.margeProzent).toBe(48)
    expect(r.ergebnisBeiVollerAbrechnung).toBe(1480)
  })
  it('wendet den Lohnnebenkosten-Zuschlag nur auf Personalkosten an', () => {
    const r = berechneBaustellenErgebnis({ erloesNetto: 1000, zeilen: z, zuschlagProzent: 20 })
    expect(r.personalkosten).toBe(600)
    expect(r.kostenGesamt).toBe(620)
    expect(r.ergebnisBeiVollerAbrechnung).toBeNull()
  })
  it('weist Mitarbeiter ohne Stundensatz aus statt sie mit 0 € zu bewerten', () => {
    const r = berechneBaustellenErgebnis({ erloesNetto: 500, zeilen: [...z, { id: 'c', name: 'C. Neu', stunden: 8, satz: 0 }] })
    expect(r.ohneSatz).toEqual(['C. Neu'])
    expect(r.stundenOhneSatz).toBe(8)
    expect(r.stunden).toBe(23)
    expect(r.personalkosten).toBe(500)
    expect(r.je.find((x) => x.id === 'c')?.kosten).toBeNull()
  })
  it('keine Marge ohne Erlös, negatives Ergebnis möglich, Müllwerte werden 0', () => {
    const r = berechneBaustellenErgebnis({ erloesNetto: 0, zeilen: [{ id: 'a', name: 'A', stunden: 2, satz: 50 }, { id: 'x', name: 'X', stunden: NaN as any, satz: 'abc' as any }] })
    expect(r.margeProzent).toBeNull()
    expect(r.ergebnis).toBe(-100)
    expect(r.ohneSatz).toEqual([])
  })
  it('Gutschriften (negativer Erlös) mindern das Ergebnis', () => {
    expect(berechneBaustellenErgebnis({ erloesNetto: 300 - 100, zeilen: [] }).ergebnis).toBe(200)
  })
})
