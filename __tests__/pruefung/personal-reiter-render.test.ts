import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PersonalStamm from '@/components/PersonalStamm'
import PersonalDokumente from '@/components/PersonalDokumente'
import MitarbeiterPage from '@/app/mitarbeiter/page'

describe('Personal-Reiter', () => {
  it('Seite zeigt drei Reiter, zuerst Zugänge & Lohnabrechnung', () => {
    const html = renderToStaticMarkup(createElement(MitarbeiterPage))
    for (const t of ['reiter-zugaenge', 'reiter-stamm', 'reiter-dokumente']) expect(html).toContain(t)
    expect(html).toContain('Neuen Zugang anlegen'); expect(html).not.toContain('personal-stamm')
  })
  it('Mitarbeiter-Reiter bietet Auswahl und „Neuen Mitarbeiter anlegen“, Formular erst nach Auswahl', () => {
    const html = renderToStaticMarkup(createElement(PersonalStamm))
    expect(html).toContain('Neuen Mitarbeiter anlegen'); expect(html).not.toContain('stamm-formular')
  })
  it('Planung hat keinen Mitarbeiter-Reiter mehr', async () => {
    const q = await import('node:fs').then(f => f.readFileSync('app/planung/page.tsx', 'utf8'))
    expect(q).not.toContain("setActiveTab('employees')"); expect(q).not.toContain('setShowAddEmployee')
  })
  it('Dokumente-Reiter zeigt Fälligkeitsbereich und Eingabe mit allen Kategorien', () => {
    const html = renderToStaticMarkup(createElement(PersonalDokumente, { employees: [{ id: 'e1', first_name: 'Max', last_name: 'Muster' }] }))
    for (const t of ['Personalien', 'Lehrgänge', 'G-Untersuchungen', 'Führer- und Kranscheine', 'Muster, Max', 'Bald fällig']) expect(html).toContain(t)
  })
})
