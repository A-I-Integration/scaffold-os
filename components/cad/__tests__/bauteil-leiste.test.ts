import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BauteilLeiste from '../BauteilLeiste'
import { CATALOG_ITEMS } from '../ComponentCatalog'

describe('BauteilLeiste', () => {
  const html = (p: { disabled?: boolean; selectedType?: string | null }) => renderToStaticMarkup(createElement(BauteilLeiste, { onSelectType: () => {}, ...p }))
  it('zeigt jedes Katalog-Bauteil als Knopf', () => {
    const h = html({})
    for (const i of CATALOG_ITEMS) expect(h).toContain(i.label)
    expect((h.match(/<button/g) ?? []).length).toBe(CATALOG_ITEMS.length)
  })
  it('ohne Modell sind die Knöpfe gesperrt und der Hinweis nennt den Grund', () => {
    const h = html({ disabled: true })
    expect((h.match(/disabled=""/g) ?? []).length).toBe(CATALOG_ITEMS.length)
    expect(h).toContain('Erst ein Gebäude anlegen.')
  })
  it('gewähltes Bauteil ist gedrückt markiert', () => {
    const h = html({ selectedType: 'f_railing' })
    expect((h.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
    expect(h).toContain('Jetzt ins Modell klicken')
  })
})
