import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ZeitTagesuebersicht from '@/components/ZeitTagesuebersicht'
import ZeiterfassungPage from '@/app/zeiterfassung/page'

describe('Zeiterfassung: Tagesansicht', () => {
  it('Seite bietet die Reiter Monat und Tag', () => {
    const html = renderToStaticMarkup(createElement(ZeiterfassungPage))
    expect(html).toContain('zeit-reiter-monat'); expect(html).toContain('zeit-reiter-tag')
  })
  it('Tagesansicht: Datum, Eintragen nur für Berechtigte', () => {
    const dispo = renderToStaticMarkup(createElement(ZeitTagesuebersicht, { canEdit: true }))
    expect(dispo).toContain('tag-datum'); expect(dispo).toContain('tag-neu')
    const lesen = renderToStaticMarkup(createElement(ZeitTagesuebersicht, { canEdit: false }))
    expect(lesen).toContain('tag-datum'); expect(lesen).not.toContain('tag-neu')
  })
})
