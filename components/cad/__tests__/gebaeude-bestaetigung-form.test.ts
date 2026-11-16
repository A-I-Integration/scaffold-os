import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(__dirname, '..', 'BuildingForm.tsx'), 'utf8')

describe('BuildingForm: Plan-Import wartet auf Bestätigung', () => {
  it('Plan-Werte werden erst nach „Übernehmen“ ans Gerüst gegeben', () => {
    const warten = src.indexOf('setPlanWartet({ gebaeude: neuesGebaeude')
    const direkt = src.indexOf('onChange(neuesGebaeude)')
    expect(warten).toBeGreaterThan(0)
    expect(direkt).toBeGreaterThan(warten) // Plan-Pfad kehrt vorher zurück
    expect(src).toContain('onChange(planWartet.gebaeude)')
  })
  it('Karte mit Übernehmen, Verwerfen und Haken bei Rot', () => {
    for (const id of ['gebaeude-bestaetigung', 'gebaeude-uebernehmen', 'gebaeude-verwerfen']) expect(src).toContain(id)
    expect(src).toContain('darfUebernehmen(')
  })
  it('Verwerfen stellt die Auto-Felder-Merkliste wieder her', () => {
    expect(src).toContain('analyseFelderRef.current = planWartet.vorherFelder')
  })
})
