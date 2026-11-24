import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import UrlaubsUebersicht from '@/components/UrlaubsUebersicht'
import UrlaubskontoKarte from '@/components/UrlaubskontoKarte'
import { urlaubskonto } from '@/lib/urlaubskonto'

describe('Urlaubskonto-Anzeige', () => {
  it('Übersicht für Dispo/Chef zeigt Anspruch, genehmigt, beantragt, unbezahlt und aktuellen Anspruch', () => {
    const konto = urlaubskonto({ anspruch: [{ tage_pro_jahr: 30, gueltig_ab: '2026-01-01' }], eintritt: '2026-01-01' },
      [{ id: 'a', start_date: '2026-03-02', end_date: '2026-03-06', status: 'approved' }], '2026-11-24')
    const html = renderToStaticMarkup(createElement(UrlaubsUebersicht, { konten: [{ employee_id: 'e1', name: 'Max Muster', konto }] }))
    expect(html).toContain('Urlaubskonto 2026'); expect(html).toContain('Max Muster'); expect(html).toContain('urlaubsuebersicht-zeile')
    expect(html).toContain('aktueller Anspruch'); expect(html).toContain('22,5') // 27,5 zustehend − 5 genehmigt
  })
  it('leere Liste zeigt nichts', () => {
    expect(renderToStaticMarkup(createElement(UrlaubsUebersicht, { konten: [] }))).toBe('')
  })
  it('Karte ohne Mitarbeiter rendert nichts, mit Mitarbeiter den Ladezustand', () => {
    expect(renderToStaticMarkup(createElement(UrlaubskontoKarte, { employeeId: '' }))).toBe('')
    expect(renderToStaticMarkup(createElement(UrlaubskontoKarte, { employeeId: 'e1' }))).toContain('Urlaubskonto wird geladen')
  })
})
