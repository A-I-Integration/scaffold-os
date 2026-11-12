import { describe, it, expect } from 'vitest'
import { kotenJeAnsicht, koteWert } from '../koten-je-ansicht'

const t = (s: string, x: number, y: number) => ({ s, x, y })

describe('koteWert', () => {
  it('liest Vorzeichen und Komma', () => {
    expect(koteWert('+5,92')).toBe(5.92)
    expect(koteWert('-2,55')).toBe(-2.55)
    expect(koteWert('±0,00')).toBe(0)
    expect(koteWert('5920')).toBeNull()
  })
})

describe('kotenJeAnsicht', () => {
  const texte = [
    t('NORDANSICHT', 200, 400), t('OSTANSICHT', 1200, 400), t('SCHNITT A-A', 200, 770),
    t('+6,81', 870, 430), t('+1,55', 440, 580), t('-2,55', 890, 700),
    t('+5,92', 1320, 458), t('+6,94', 1670, 430), t('+6,94', 620, 845), t('+5,92', 290, 874),
    t('Traufe', 290, 865), t('Abbruch First', 428, 793), t('+8,44', 437, 803),
  ]
  const r = kotenJeAnsicht(texte)
  const von = (art: string) => r.find((a) => a.art === art)!
  it('ordnet Koten der Ansicht links oberhalb zu', () => {
    expect(von('nord').koten.map((k) => k.hoeheM)).toEqual([1.55, 6.81, -2.55])
    expect(von('ost').koten.map((k) => k.hoeheM)).toEqual([5.92, 6.94])
    expect(von('schnitt').koten.map((k) => k.hoeheM)).toEqual([5.92, 6.94])
  })
  it('schließt Abbruch-Koten aus', () => {
    expect(r.flatMap((a) => a.koten).some((k) => k.hoeheM === 8.44)).toBe(false)
  })
  it('erkennt die Bezeichnung Traufe', () => {
    expect(von('schnitt').koten.find((k) => k.hoeheM === 5.92)?.bezeichnung).toBe('Traufe')
  })
  it('ohne Titel nichts', () => { expect(kotenJeAnsicht([t('+1,00', 1, 1)])).toEqual([]) })
})
