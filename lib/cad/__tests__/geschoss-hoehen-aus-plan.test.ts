import { describe, expect, it } from 'vitest'
import { geschossHoehenAusPlan } from '../geschoss-hoehen-aus-plan'

const t = (s: string) => ({ s, x: 0, y: 0 })

describe('geschossHoehenAusPlan', () => {
  it('liest nur explizit beschriftete OKFF-Koten mit Geschosszuordnung', () => {
    expect(geschossHoehenAusPlan([t('OKFF EG +0,15'), t('OK FFB 1. OG +3,20'), t('First +8,40'), t('+5,90')])).toMatchObject([
      { ebene: 0, obenM: 0.15, bestaetigungErforderlich: true },
      { ebene: 1, obenM: 3.2, bestaetigungErforderlich: true },
    ])
  })

  it('ignoriert First, Traufe, Gelände und unbeschriftete Koten', () => {
    expect(geschossHoehenAusPlan([t('First +8,40'), t('Traufe +5,90'), t('Gelände -0,30'), t('+3,20')])).toEqual([])
  })

  it('verwirft widersprüchliche Koten desselben Geschosses', () => {
    expect(geschossHoehenAusPlan([t('OKFF EG +0,00'), t('OKFF EG +0,20')])).toEqual([])
  })

  it('ordnet getrennte Textobjekte nicht spekulativ zusammen', () => {
    expect(geschossHoehenAusPlan([t('OKFF EG'), t('+0,00')])).toEqual([])
  })
})
