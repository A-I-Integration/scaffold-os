import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OrtungVorschlag, OrtungImport } from '@/components/OrtungBloecke'
import ZeitTagesuebersicht from '@/components/ZeitTagesuebersicht'

describe('Ortungs-Oberfläche', () => {
  it('Vorschlags-Knopf ist da, die Liste erst nach dem Prüfen', () => {
    const html = renderToStaticMarkup(createElement(OrtungVorschlag, { employeeId: 'e1', datum: '2026-11-10', onUebernommen: () => {} }))
    expect(html).toContain('ortung-pruefen'); expect(html).not.toContain('ortung-liste')
  })
  it('Import ist eingeklappt', () => {
    const html = renderToStaticMarkup(createElement(OrtungImport))
    expect(html).toContain('ortung-import-toggle'); expect(html).not.toContain('ortung-datei')
  })
  it('Tagesansicht zeigt den Import nur für Berechtigte', () => {
    expect(renderToStaticMarkup(createElement(ZeitTagesuebersicht, { canEdit: true }))).toContain('ortung-import')
    expect(renderToStaticMarkup(createElement(ZeitTagesuebersicht, { canEdit: false }))).not.toContain('ortung-import')
  })
})
