import { describe, expect, it } from 'vitest'
import { dachformAusPlan } from '../dachform-aus-plan'
import type { GefundenerGrundriss } from '../grundriss-finden'

const kontur = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }]
const og = (ebene = 1): GefundenerGrundriss => ({ titel: 'OG', ebene, kontur, farbe: '#ff8000', breiteM: 10, tiefeM: 10, flaecheM2: 100 })
const M = 1 / 28.35
const t = (s: string, x: number, y: number) => ({ s, x, y })

describe('dachformAusPlan', () => {
  it('First oben, Traufe unten = Pultdach', () => {
    expect(dachformAusPlan([og()], [t('First', -10, 20), t('First', 310, 20), t('Traufe', 0, 330), t('Traufe', 280, 330)], M)).toBe('Pultdach')
  })
  it('First in der Mitte, Traufe an beiden Seiten = Satteldach', () => {
    expect(dachformAusPlan([og()], [t('First', 150, 150), t('Traufe', 150, -20), t('Traufe', 150, 320)], M)).toBe('Satteldach')
  })
  it('Beschriftungen außerhalb des Grundrisses oder unklar = null', () => {
    expect(dachformAusPlan([og()], [t('First', 5000, 5000), t('Traufe', 5000, 5100)], M)).toBeNull()
    expect(dachformAusPlan([og()], [t('First', 150, 20)], M)).toBeNull()
    expect(dachformAusPlan([og()], [t('First', 20, 20), t('Traufe', 20, 20)], M)).toBeNull()
  })
  it('"Traufe Vordach" und "Abbruch First" zählen nicht', () => {
    expect(dachformAusPlan([og()], [t('Abbruch First', -10, 20), t('Traufe Vordach', 0, 330)], M)).toBeNull()
  })
  it('Keller wird nicht ausgewertet', () => {
    expect(dachformAusPlan([og(-1)], [t('First', 150, 20), t('Traufe', 150, 320)], M)).toBeNull()
  })
})

import { dachKotenAusPlan, pultdachNeigung, dachAusPlan } from '../dachform-aus-plan'
describe('Dach-Koten', () => {
  it('liest die Kote unter FIRST und Traufe', () => {
    expect(dachKotenAusPlan([t('FIRST', 624, 836), t('+6,94', 620, 845), t('Traufe', 291, 865), t('+5,92', 290, 874)])).toEqual({ firstM: 6.94, traufeM: 5.92 })
  })
  it('lässt widersprüchliche Koten weg', () => {
    expect(dachKotenAusPlan([t('First', 0, 0), t('+6,94', 0, 9), t('First', 300, 0), t('+8,44', 300, 9)])).toEqual({})
  })
  it('ABBRUCH FIRST zählt nicht', () => {
    expect(dachKotenAusPlan([t('ABBRUCH FIRST', 0, 0), t('+8,44', 0, 9)])).toEqual({})
  })
  it('Neigung = atan(Höhenunterschied / Tiefe)', () => {
    expect(pultdachNeigung(6.94, 5.92, 10.34)).toBeCloseTo(5.6, 1)
    expect(pultdachNeigung(5, 6, 10)).toBeNull()
  })
  it('liefert die Tiefe quer zum First', () => {
    const r = dachAusPlan([og()], [t('First', -10, 20), t('First', 310, 20), t('Traufe', 0, 330), t('Traufe', 280, 330)], M)
    expect(r?.dachform).toBe('Pultdach')
    expect(r?.tiefeM).toBeCloseTo(300 * M, 1)
  })
})
