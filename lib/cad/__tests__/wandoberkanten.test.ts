import { describe, it, expect } from 'vitest'
import { wandOberkantenVorschlag } from '../wandoberkanten'

describe('wandOberkantenVorschlag', () => {
  it('Wandoberkante = Fußboden-Kote des nächsten Geschosses, oberstes Geschoss = Traufe', () => {
    const w = wandOberkantenVorschlag([{ ebene: 0, obenM: 0 }, { ebene: 1, obenM: 2.95 }, { ebene: -1, obenM: -2.76 }], 5.92)
    expect(w).toEqual([2.95, 5.92, 0])
  })
  it('ohne Traufe bleibt der Wert des obersten Geschosses unverändert; Dachebene 99 zählt als Abschluss', () => {
    expect(wandOberkantenVorschlag([{ ebene: 0, obenM: 0 }, { ebene: 1, obenM: 2.95 }])).toEqual([2.95, 2.95])
    expect(wandOberkantenVorschlag([{ ebene: 0, obenM: 0 }, { ebene: 1, obenM: 2.95 }, { ebene: 99, obenM: 6.94 }], 5.92)).toEqual([2.95, 6.94, 6.94])
  })
  it('Reihenfolge der Eingabe bleibt, ein Eintrag ohne höheres Geschoss und mit niedrigerer Traufe bleibt', () => {
    expect(wandOberkantenVorschlag([{ ebene: 1, obenM: 3 }], 2)).toEqual([3])
  })
})
