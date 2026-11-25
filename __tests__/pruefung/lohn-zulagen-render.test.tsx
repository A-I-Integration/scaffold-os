import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PfaendungBlock, KmSatzBlock, LohnMonatsUebersicht } from '@/components/LohnZulagenBloecke'
import { STANDARD_GRENZEN } from '@/lib/pfaendung'

const noop = async () => true
describe('Lohn-Zulagen Darstellung', () => {
  it('Pfändungsblock: Formular, Liste, Monatsrechnung', () => {
    const html = renderToStaticMarkup(<PfaendungBlock laeuft={false} senden={noop} loeschen={async () => {}} grenzen={STANDARD_GRENZEN} monate={[]}
      pfaendungen={[{ id: 'p', glaeubiger: 'Bank A', rang: 1, unterhaltspersonen: 1, gueltig_ab: '2026-01-01' }]} />)
    for (const id of ['pfaendung-block', 'pf-glaeubiger', 'pf-speichern', 'pf-liste', 'pf-monat', 'pf-netto']) expect(html).toContain(`data-testid="${id}"`)
    expect(html).toContain('Bank A')
  })
  it('ohne Pfändung keine Monatsrechnung', () => {
    expect(renderToStaticMarkup(<PfaendungBlock laeuft={false} senden={noop} loeschen={async () => {}} grenzen={STANDARD_GRENZEN} monate={[]} pfaendungen={[]} />)).not.toContain('pf-monat')
  })
  it('Kilometersatz und Monatsübersicht', () => {
    expect(renderToStaticMarkup(<KmSatzBlock kmSatz={null} laeuft={false} senden={noop} />)).toContain('noch nicht festgelegt')
    const html = renderToStaticMarkup(<LohnMonatsUebersicht />)
    for (const id of ['lohn-uebersicht', 'lohn-uebersicht-csv', 'lohn-uebersicht-excel']) expect(html).toContain(`data-testid="${id}"`)
  })
})
