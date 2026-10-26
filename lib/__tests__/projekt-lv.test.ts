import { describe, it, expect } from 'vitest'
import { rechneLvNeu, pruefeLvEingabe } from '../projekt-lv'
import type { Leistungsverzeichnis } from '../leistungsverzeichnis'

const lv = (): Leistungsverzeichnis => ({
  mengeStellen: 2, eingaben: {} as never, kopf: [], annahmen: [], fehlendeAngaben: [], summeNetto: 0, mwst: 0, summeBrutto: 0,
  titel: [{ nr: 1, nrText: '01', titel: 'Gerüst', summe: 0, positionen: [
    { nr: '01.1', titel: 'A', text: [], menge: 10, einheit: 'm²', ep: 5, gp: 0 },
    { nr: '01.2', titel: 'B', text: [], menge: 2, einheit: 'Stk.', ep: 100, gp: 0, faktorProzent: 80 },
  ] }],
})

describe('rechneLvNeu', () => {
  it('rechnet Menge × EP × Faktor und Summen', () => {
    const r = rechneLvNeu(lv())
    expect(r.titel[0].positionen[0].gp).toBe(50)
    expect(r.titel[0].positionen[1].gp).toBe(160)
    expect(r.summeNetto).toBe(210)
    expect(r.mwst).toBe(39.9)
    expect(r.summeBrutto).toBe(249.9)
  })
  it('entfallene Position zählt 0', () => {
    const x = lv(); x.titel[0].positionen[0].entfaellt = true
    expect(rechneLvNeu(x).summeNetto).toBe(160)
  })
  it('negative Eingaben werden zu 0', () => {
    const x = lv(); x.titel[0].positionen[0].menge = -3
    expect(rechneLvNeu(x).titel[0].positionen[0].gp).toBe(0)
  })
})

describe('pruefeLvEingabe', () => {
  it('verlangt Art und LV beim Anlegen', () => {
    expect(pruefeLvEingabe({}, true)).toBe('Unbekannte Art')
    expect(pruefeLvEingabe({ art: 'auftrag' }, true)).toBe('Leistungsverzeichnis fehlt')
    expect(pruefeLvEingabe({ art: 'nachtrag', lv: lv() }, true)).toBeNull()
  })
  it('lässt Teiländerung zu', () => {
    expect(pruefeLvEingabe({ status: 'gueltig' }, false)).toBeNull()
    expect(pruefeLvEingabe({ status: 'x' }, false)).toBe('Unbekannter Status')
  })
})
