import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import StundenlohnBlock from '@/components/StundenlohnBlock'

describe('Stundenlohn-Block', () => {
  it('zeigt Überschrift und Mitarbeiterauswahl, ohne vorbelegte Löhne', () => {
    const html = renderToStaticMarkup(createElement(StundenlohnBlock, { employees: [{ id: 'e1', first_name: 'Max', last_name: 'Muster' }] }))
    expect(html).toContain('Stundenlohn'); expect(html).toContain('Max Muster'); expect(html).toContain('– Mitarbeiter wählen –')
    expect(html).not.toContain('stundenlohn-verlauf'); expect(html).not.toContain('€ pro Stunde')
  })
})
