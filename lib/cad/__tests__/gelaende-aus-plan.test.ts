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
