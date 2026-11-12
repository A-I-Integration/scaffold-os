import { describe, it, expect } from 'vitest'
import { kotenJeAnsicht, koteWert, pultNiedrigeRichtung } from '../koten-je-ansicht'

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

describe('pultNiedrigeRichtung', () => {
  // Werte wie im Einreichplan: Südansicht +6,94 links, +5,92 rechts; Nordansicht +6,81 (Solar) rechts, +5,15 weiter links
  const su = { titel: 'SÜDANSICHT', art: 'sued' as const, x: 1784, y: 401, koten: [{ hoeheM: 6.94, x: 2075, y: 429 }, { hoeheM: 5.92, x: 2228, y: 458 }] }
  it('Südansicht: Traufe rechts = Osten', () => { expect(pultNiedrigeRichtung([su], 5.92, 6.94)).toBe('ost') })
  it('Nordansicht: Traufe links = Osten (Blick nach Süden)', () => {
    const no = { titel: 'NORDANSICHT', art: 'nord' as const, x: 198, y: 401, koten: [{ hoeheM: 5.92, x: 300, y: 458 }, { hoeheM: 6.94, x: 700, y: 430 }] }
    expect(pultNiedrigeRichtung([no], 5.92, 6.94)).toBe('ost')
    expect(pultNiedrigeRichtung([su, no], 5.92, 6.94)).toBe('ost')
  })
  it('widersprüchliche oder fehlende Angaben: null', () => {
    const no = { titel: 'NORDANSICHT', art: 'nord' as const, x: 198, y: 401, koten: [{ hoeheM: 5.92, x: 700, y: 458 }, { hoeheM: 6.94, x: 300, y: 430 }] }
    expect(pultNiedrigeRichtung([su, no], 5.92, 6.94)).toBeNull()
    expect(pultNiedrigeRichtung([], 5.92, 6.94)).toBeNull()
  })
})
