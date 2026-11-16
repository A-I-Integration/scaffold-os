import { describe, it, expect } from 'vitest'
import { bestaetigungAus, darfUebernehmen, zeileAus } from '../gebaeude-bestaetigung'
import type { Pruefbericht } from '../datenqualitaet'

const bericht = (ampel: 'gruen' | 'gelb' | 'rot'): Pruefbericht => ({
  ampel,
  befunde: [
    { code: 'A', ampel: 'gruen', titel: 'ok', detail: 'x' },
    { code: 'B', ampel: 'gelb', titel: 'Maße', detail: 'bitte prüfen' },
  ],
  werte: [
    { schluessel: 'l', bezeichnung: 'Länge', wert: 12.5, einheit: 'm', quelle: 'Grundriss', methode: 'vektor', konfidenz: 'gemessen', ampel: 'gruen' },
    { schluessel: 'h', bezeichnung: 'Firsthöhe', quelle: 'Schnitt', methode: 'text', konfidenz: 'fehlt', ampel: 'gruen' },
  ],
})

describe('Gebäude-Bestätigung', () => {
  it('zeigt Wert, Einheit und Quelle; fehlende Werte als „fehlt“, nie als 0', () => {
    const b = bestaetigungAus(bericht('gelb'))
    expect(b.zeilen[0]).toMatchObject({ anzeige: '12,5 m', quelle: 'Grundriss', ampel: 'gruen' })
    expect(b.zeilen[1].anzeige).toBe('fehlt')
    expect(b.zeilen[1].ampel).toBe('gelb')
  })
  it('listet nur offene Befunde', () => {
    expect(bestaetigungAus(bericht('gelb')).befunde).toEqual(['Maße: bitte prüfen'])
  })
  it('Rot braucht den Haken, Gelb und Grün nicht', () => {
    expect(darfUebernehmen(bestaetigungAus(bericht('rot')), false)).toBe(false)
    expect(darfUebernehmen(bestaetigungAus(bericht('rot')), true)).toBe(true)
    expect(darfUebernehmen(bestaetigungAus(bericht('gelb')), false)).toBe(true)
    expect(darfUebernehmen(bestaetigungAus(bericht('gruen')), false)).toBe(true)
  })
  it('Text-Werte werden unverändert angezeigt', () => {
    expect(zeileAus({ schluessel: 'm', bezeichnung: 'Maßstab', wert: '1:100', quelle: 'Plankopf', methode: 'text', konfidenz: 'gelesen', ampel: 'gruen' }).anzeige).toBe('1:100')
  })
})
