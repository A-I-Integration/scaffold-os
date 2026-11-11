import { describe, expect, it } from 'vitest'
import { gelaendeAusPlan } from '../gelaende-aus-plan'
import type { GefundenerGrundriss } from '../grundriss-finden'

const kontur = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }, { x: 0, y: 800 }]
const g: GefundenerGrundriss = { titel: 'EG', ebene: 0, kontur, farbe: '#ff8000', breiteM: 10, tiefeM: 8, flaecheM2: 80 }
const t = (s: string, x: number, y: number) => ({ s, x, y })
describe('gelaendeAusPlan', () => {
  it('nimmt Koten im Streifen um das Haus', () => {
    const r = gelaendeAusPlan(g, [t('-0,43', 1050, 100), t('+1,37', 1100, 500), t('+9,99', 9000, 9000), t('13,05', 500, 400)], 0.01)
    expect(r).toMatchObject({ minM: -0.43, maxM: 1.37, anzahl: 2, unterschiedM: 1.8 })
  })
  it('weniger als zwei Punkte: nichts', () => {
    expect(gelaendeAusPlan(g, [t('-0,43', 1050, 100)], 0.01)).toBeNull()
  })
})

import { gelaendeJeKante } from '../gelaende-aus-plan'
describe('gelaendeJeKante', () => {
  const r = { x0: 0, y0: 0, x1: 1000, y1: 800 }
  it('ordnet Koten der nächsten Kante zu, ignoriert Koten im Haus und weit draußen', () => {
    const je = gelaendeJeKante(r, [t('-0,43', 500, 850), t('-0,10', 300, 820), t('+1,37', 500, -100), t('+0,50', 500, 400), t('+9,99', 9000, 9000)], 0.01)
    const unten = je.find((k) => k.kante === 'unten'), oben = je.find((k) => k.kante === 'oben')
    expect(unten).toMatchObject({ minM: -0.43, maxM: -0.1, anzahl: 2 })
    expect(oben).toMatchObject({ minM: 1.37, anzahl: 1 })
    expect(je).toHaveLength(2)
  })
})
